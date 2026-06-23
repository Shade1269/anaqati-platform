-- ============================================================
-- نظام المعارض — إقفال الفترة + قائمة التدفق النقدي | Migration 009
-- ============================================================

-- إقفال الفترة: ترحيل الإيرادات/المصروفات إلى الأرباح المحتجزة (3900)
create or replace function exhibitions.close_period(p_date date default current_date, p_memo text default 'إقفال الفترة')
returns json language plpgsql security definer set search_path=exhibitions,public as $$
declare v_lines jsonb := '[]'::jsonb; rec record; v_net numeric:=0; v_entry uuid;
begin
  if not exhibitions.is_admin() then raise exception 'غير مصرّح'; end if;
  for rec in
    select a.code, a.type,
      coalesce(sum(jl.debit),0)-coalesce(sum(jl.credit),0) as dr_bal,
      coalesce(sum(jl.credit),0)-coalesce(sum(jl.debit),0) as cr_bal
    from exhibitions.accounts a
    join exhibitions.journal_lines jl on jl.account_code=a.code
    join exhibitions.journal_entries e on e.id=jl.entry_id and e.entry_date<=p_date
    where a.type in ('revenue','expense')
    group by a.code,a.type
    having coalesce(sum(jl.debit),0)-coalesce(sum(jl.credit),0) <> 0
  loop
    if rec.type='revenue' then
      v_lines := v_lines || jsonb_build_object('account',rec.code,'debit',rec.cr_bal,'credit',0);
      v_net := v_net + rec.cr_bal;
    else
      v_lines := v_lines || jsonb_build_object('account',rec.code,'debit',0,'credit',rec.dr_bal);
      v_net := v_net - rec.dr_bal;
    end if;
  end loop;
  if jsonb_array_length(v_lines)=0 then return json_build_object('closed',false,'net_income',0); end if;
  if v_net >= 0 then
    v_lines := v_lines || jsonb_build_object('account','3900','debit',0,'credit',v_net);
  else
    v_lines := v_lines || jsonb_build_object('account','3900','debit',-v_net,'credit',0);
  end if;
  v_entry := exhibitions._post(p_date, p_memo, 'period_close', null, v_lines);
  return json_build_object('closed',true,'net_income',v_net,'entry_id',v_entry);
end $$;

-- قائمة التدفق النقدي (مباشرة): تجميع حركة الصندوق/الشبكة حسب الطرف المقابل
create or replace function exhibitions.cash_flow(p_from date default null, p_to date default null)
returns json language sql stable security definer set search_path=exhibitions,public as $$
  with cash_entries as (
    select e.id, coalesce(nullif(e.memo,''),'أخرى') as category, sum(jl.debit-jl.credit) as cash_delta
    from exhibitions.journal_lines jl join exhibitions.journal_entries e on e.id=jl.entry_id
    where jl.account_code in ('1010','1020')
      and (p_from is null or e.entry_date>=p_from) and (p_to is null or e.entry_date<=p_to)
    group by e.id, e.memo),
  agg as (select category,
      sum(case when cash_delta>0 then cash_delta else 0 end) inflow,
      sum(case when cash_delta<0 then -cash_delta else 0 end) outflow
    from cash_entries group by category)
  select json_build_object(
    'inflows',(select coalesce(json_agg(json_build_object('category',category,'amount',inflow) order by inflow desc),'[]') from agg where inflow>0),
    'outflows',(select coalesce(json_agg(json_build_object('category',category,'amount',outflow) order by outflow desc),'[]') from agg where outflow>0),
    'net_change',(select coalesce(sum(cash_delta),0) from cash_entries),
    'total_in',(select coalesce(sum(inflow),0) from agg),
    'total_out',(select coalesce(sum(outflow),0) from agg));
$$;

grant execute on function exhibitions.close_period(date,text) to authenticated;
grant execute on function exhibitions.cash_flow(date,date) to authenticated;
