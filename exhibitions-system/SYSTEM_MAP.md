# خريطة النظام — المرجع الموحّد (SYSTEM_MAP)

> هذا الملف هو **المصدر الوحيد للحقيقة** لما هو مبنيّ فعلًا في النظام.
> يُحدّث مع كل وحدة جديدة. ابدأ أي جلسة عمل بقراءته قبل الاقتراح أو البناء.
> آخر تحديث: 2026-07-02 — بعد إضافة وحدة CRM + عروض الأسعار (migration 058).

النظام: SaaS محاسبي/ERP متعدد المستأجرين (Arabic/RTL، ثيم غامق+ذهبي) لـ SMEs.
- قاعدة البيانات: Supabase Postgres، schema `exhibitions`، project `axzqbqzdvtlbgbwzeiry`.
- الواجهة: React + Vite + TypeScript (`exhibitions-system/web`).
- الموقع المباشر: www.sindbadsa.com (Vercel، ينشر تلقائيًا عند الدفع إلى `main`).

---

## 1) المحرّكات المركزية (يُعاد استخدامها في كل وحدة)

| المحرك | الملف | الدور |
|---|---|---|
| `_post(date,memo,src,src_id,lines jsonb)` | 006 | القيد المزدوج — كل حركة مالية تمرّ منه |
| `_move_stock(product,qty,from_type,from_id,to_type,to_id,movement,ref_table,ref_id,actor)` | 002/044 | حركة المخزون المركزية (numeric) — يكتب `stock_movements` ويحدّث `inventory` |
| `current_tenant_id()` / `_set_tenant()` / RLS | 010 | عزل المستأجرين + ختم tenant_id تلقائيًا |
| `is_admin()` / `_im_can(perm)` / `_emp_require()` | 001/010/026 | الصلاحيات (مالك / مدير مخزون / موظف) |
| `current_profile_id()` / `is_platform_admin()` | 010 | هوية الفاعل / مالك المنصّة |
| `_batch_add` / `_consume_fefo` | 045 | إنشاء دفعة / استهلاك FEFO |
| `_shift_z` / `_gshift_z` | 029/057 | حساب تقرير Z للورديات |

**قالب إضافة أي وحدة جديدة (ثابت):**
`CREATE TABLE` + `enable RLS` + سياسة `is_admin() AND tenant_id=current_tenant_id()` + trigger `_set_tenant()` + دوال `SECURITY DEFINER SET search_path` مع `_<module>_tenant()` gate + ترحيل محاسبي عبر `_post()`.

> ملاحظات مهمّة (مطبّات معروفة):
> - إضافة بارامترات لدالة عبر `CREATE OR REPLACE` تُنشئ توقيعًا جديدًا — لازم `DROP` التوقيع القديم أولًا (خطأ PostgREST "could not choose best candidate").
> - أي دالة SECURITY DEFINER لازم `SET search_path`.
> - البناء: `cd exhibitions-system/web && npx tsc --noEmit && npm run build` (جذر المستودع فيه Next.js مختلف).
> - كل migration يُطبّق عبر MCP **و** يُحفظ كملف في `db/` (لا تنسَ الملف).

---

## 2) القطاعات (business_type)

`retail` · `restaurant` · `manufacturing` · `distribution` · `grocery`
(+ `business_subtype` للتصنيع: `general` · `plastics` · `wood` · `metal`)

يُحدَّد في `create_tenant`، ويصل للواجهة عبر `my_profile()` و`employee_login()`.
`AdminLayout.ownerSections()` يبني قائمة مختلفة لكل قطاع، و`AdminDashboard` يوجّه للوحة المناسبة.

| القطاع | ما يميّزه |
|---|---|
| retail | معارض/فروع، عُهدة، جملة، بيع POS، عمولات، تسويات |
| grocery | نموذج retail + كاشير بقالة احترافي (باركود/PLU، دفع مقسّم، خصومات، ولاء، مرتجعات، تعليق، وردية) |
| restaurant | قوائم/طاولات/جلسات/KDS، مكوّنات+وصفات، خدمة%/ضريبة/إكرامية، QR + أونلاين |
| manufacturing | مواد/BOM/مسارات/مراكز عمل/أوامر عمل/عمالة، تسعير وفوترة، قوالب حسب النوع |
| distribution | خطوط سير، تحميل مركبات، بيع مندوبين آجل، لوحة توزيع |

---

## 3) الجداول حسب المجال

- **المستأجرون/المنصّة:** `tenants`, `platform_admins`
- **الهوية/HR:** `profiles`, `employee_details`, `employee_sessions`, `employee_permissions`, `im_permissions`, `attendance`, `salary_advances`, `payroll`, `commissions`, `notifications`, `audit_log`
- **المخزون:** `categories`, `products`, `warehouses`, `branches`, `inventory`, `stock_movements`, `stock_receipts(+_items)`, `stock_requests(+_items)`, `stock_transfers(+_items)`, `product_uoms`, `stock_batches`, `stock_counts(+_items)`
- **العُهدة:** `consignment_withdrawals`, `consignment_settlements`
- **المبيعات/POS:** `sales(+_items)`, `sale_returns(+_items)`, `wholesale_orders(+_items)`, `cashier_shifts`, `held_sales`
- **المحاسبة/المصاريف:** `expenses`, `accounts`, `journal_entries`, `journal_lines`
- **الموردون/الشراء:** `suppliers`, `supplier_payments`, `purchase_orders(+_items)`
- **العملاء:** `customers`, `customer_entries`
- **المتجر الإلكتروني:** `online_orders(+_items)`
- **المطاعم:** `menu_categories`, `menu_items`, `menu_item_options`, `dining_tables`, `table_sessions`, `orders`, `order_items`, `ingredients`, `ingredient_movements`, `recipe_items`
- **التصنيع:** `work_centers`, `mfg_materials`, `mfg_material_moves`, `mfg_products`, `mfg_bom`, `mfg_routing`, `mfg_work_orders`, `mfg_wo_materials`, `mfg_wo_labor`, `mfg_molds`
- **السوق الداخلي:** `market_listings`, `market_orders`, `market_order_items`
- **قوائم الأسعار:** `price_lists`, `price_list_items`
- **CRM/عروض الأسعار:** `leads` (عملاء محتملون بمسار مبيعات), `quotations`, `quotation_items`
- **التوزيع/التوصيل:** `delivery_routes`, `route_stops`, `deliveries`, `delivery_items`
- **SMS/إعدادات:** `app_config`, `sms_templates`, `sms_log`

---

## 4) شجرة الحسابات (accounts)

**أصول:** 1010 صندوق · 1020 شبكة/بنك · 1100 مخزون · 1200 ذمم موظفين (عُهدة) · 1210 سُلف موظفين · 1300 ذمم عملاء
**خصوم/حقوق ملكية:** 2010 موردون · 2200 عمولات مستحقة · 2300 ضريبة مستحقة · 2310 إكراميات مستحقة · 3010 رأس المال · 3020 مسحوبات المالك · 3900 أرباح محتجزة
**إيرادات:** 4010 مبيعات · 4020 جملة · 4030 متجر إلكتروني · 4040 مطعم · 4050 سوق داخلي · 4060 تصنيع
**مصاريف:** 5010 تكلفة المبيعات · 5100 مصاريف المعارض · 5200 رواتب · 5300 عمولات · 5400 عجز وفاقد

> توجيه النقد: card→1020 · credit→1300 · غير ذلك→1010

---

## 5) الوحدات المبنية (نظرة سريعة على RPC)

- **المحاسبة:** `trial_balance`, `income_statement`, `balance_sheet`, `account_ledger`, `cash_flow`, `financial_summary`, `post_manual_journal`, `close_period`, `profit_by_product/branch/employee/customer`
- **المخزون:** `receive_stock`, `request_stock`, `review_stock_request`, `withdraw_consignment`, `product_uom_list/set`, `product_batches`, `expiring_batches`, `stock_count_*`, `low_stock_report`, `import_products`
- **POS تجزئة:** `create_sale`, `create_sale_return`, `submit/confirm_settlement`, `shift_open/current/close/z`, `retail_report`
- **POS بقالة:** `pos_lookup`, `pos_sale`, `pos_return`, `pos_sale_lookup`, `pos_hold/held_list/held_delete`, `pos_sales_by_hour`, `gpos_shift_open/current/close`, `grocery_dashboard`
- **الجملة/الأسعار:** `create_wholesale_order`, `price_lists_*`, `price_list_items_*`, `resolve_price`
- **العملاء:** `customers_list`, `customer_set`, `customer_charge`, `customer_payment`, `customer_statement`, `customers_aging`, `loyalty_customer`, `set_loyalty_settings`, `import_customers`, `import_categories`
- **الموردون/الشراء:** `pay_supplier`, `supplier_balances`, `po_create/receive/cancel/list/get`, `import_suppliers`
- **المتجر:** `store_info`, `store_list_products`, `store_create_order`, `set_online_order_status`, `fulfill_online_order`, `update_store_settings`, `store_set_product`
- **المطاعم:** `menu_*`, `table_set`, `open_table`, `open_quick_session`, `add_order`, `session_detail`, `void_order_item`, `transfer_table`, `merge_tables`, `split_session`, `close_table_bill`, `kds_list/set_order_status`, `ingredient_*`, `recipe_get/set`, `restaurant_report`, `qr_*`, `restaurant_online_order`
- **التصنيع:** `mfg_material_*`, `mfg_workcenter_*`, `mfg_product_*`, `mfg_bom_*`, `mfg_routing_*`, `mfg_estimate`, `mfg_wo_*`, `mfg_molds_*`
- **السوق:** `market_my_listings`, `market_set/delete_listing`, `market_browse`, `market_place_order`, `market_incoming/outgoing_orders`, `market_order_detail`, `market_set_order_status`
- **التوزيع:** `route_set`, `route_stops_set`, `routes_list`, `route_get`, `van_load`, `rep_van_stock`, `record_delivery`, `deliveries_list`, `distribution_dashboard`
- **CRM/عروض الأسعار:** `leads_list`, `lead_set`, `lead_set_stage`, `lead_delete`, `lead_convert_customer`, `quotations_list`, `quotation_get`, `quotation_set`, `quotation_set_status`, `quotation_convert` (→ يُنشئ أمر بيع جملة ويرحّل عبر المحرّك), `crm_dashboard`
- **HR/الفروع:** `create_employee`, `employee_login`, `employee_dashboard`, `employee_perms_get/set`, `set_im_permissions`, `record_attendance`, `compute_payroll`, `compute_branch_commission`, `set_commission_status`, `close_branch`, `branch_close_preview`, `reconcile_and_close_branch`, `employee_file`
- **المنصّة:** `create_tenant`, `platform_list_tenants`, `set_tenant_status`, `update_tenant_branding`, `my_profile`

---

## 6) الناقص مقابل أودو (خطة الطريق)

> كل بند يتبع القالب الثابت في القسم 1. لا يحتاج إعادة بناء — إضافات تدريجية.

### أولوية عالية
- [x] **CRM + عروض الأسعار:** ✅ (058) `leads` بمسار مبيعات 6 مراحل، `quotations(+_items)`، تحويل العرض → أمر بيع جملة (يرحّل محاسبيًا)، لوحة CRM. الواجهة: `/admin/crm` + `/admin/quotations`.
- [ ] **محرّك موافقات عام:** جدول `approval_requests` (نوع، كيان، حالة، سلسلة موافقين)، ربطه بالخصومات/المصاريف/الطلبات بدل الموافقات المبرمجة.
- [ ] **إجازات + مطالبات نفقات الموظفين:** `leave_requests`, `expense_claims` مع موافقة وترحيل (السُلف موجودة أصلًا).

### أولوية متوسطة
- [ ] **الأصول الثابتة والإهلاك:** `fixed_assets`, `depreciation_schedule` + ترحيل شهري إلى GL (حسابات جديدة 1400/5500).
- [ ] **الموازنات (Budgeting):** `budgets`, `budget_lines` + تقرير فعلي مقابل مخطط.
- [ ] **مطابقة فواتير الموردين (3-way match):** `vendor_bills` تطابق PO + GRN قبل الدفع.
- [ ] **التسوية البنكية:** استيراد كشف حساب + مطابقة مع 1010/1020.
- [ ] **BI مرن / منشئ تقارير (pivot):** بدل التقارير الثابتة.

### أولوية منخفضة / لاحقًا
- [ ] مشاريع/مهام + تسجيل وقت (timesheets)
- [ ] تسويق (حملات SMS/إيميل، أتمتة) — البنية موجودة (`sms_templates`, `sms_log`)
- [ ] مكتب مساعدة / تذاكر
- [ ] فوترة متكررة للعملاء (اشتراكات)
- [ ] إدارة وثائق (DMS)
- [ ] تطبيق جوال / تطبيق مستودع بالباركود (picking/packing)

---

## 7) التموضع

لا ننافس أودو على عدد الوحدات. التموضع: **"أودو مبسّط، عربي، سحابي، لتجّار الشرق الأوسط"** —
أخفّ، أرخص، عربي أصيل RTL، وترحيل ذكي من برامج سوريا (البيان/الأمين).
القطعة الأصعب (محرّك المحاسبة + عزل المستأجرين + تعدد القطاعات) **جاهزة**.
