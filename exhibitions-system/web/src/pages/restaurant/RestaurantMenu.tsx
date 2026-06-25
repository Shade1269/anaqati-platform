import { useEffect, useState } from 'react';
import { UtensilsCrossed, Plus, Trash2, Settings2, BookText } from 'lucide-react';
import { restaurantApi } from '../../lib/api';
import type { MenuCategory, MenuItem, Ingredient } from '../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
  useToast,
} from '../../components/ui';

import { money } from '../../lib/format';
export default function RestaurantMenu() {
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCat, setNewCat] = useState('');
  const [itemDialog, setItemDialog] = useState<{ catId: string; item: MenuItem | null } | null>(null);
  const [optItem, setOptItem] = useState<MenuItem | null>(null);
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      setMenu(await restaurantApi.menu(null));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addCat(e: React.FormEvent) {
    e.preventDefault();
    if (!newCat.trim()) return;
    try {
      await restaurantApi.setCategory(null, newCat.trim(), menu.length, true);
      setNewCat('');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function delItem(id: string) {
    if (!confirm('حذف الصنف؟')) return;
    try {
      await restaurantApi.deleteItem(id);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader title="المنيو" subtitle="الأقسام والأصناف والإضافات" icon={<UtensilsCrossed size={22} />} />

      <form onSubmit={addCat} className="mb-6 flex items-end gap-2">
        <Field label="قسم جديد" className="flex-1">
          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="مشروبات ساخنة..." />
        </Field>
        <Button type="submit" icon={<Plus size={16} />}>
          إضافة قسم
        </Button>
      </form>

      {loading ? (
        <Spinner />
      ) : menu.length === 0 ? (
        <EmptyState message="لا أقسام بعد. ابدأ بإضافة قسم." />
      ) : (
        <div className="space-y-5">
          {menu.map((c) => (
            <Card key={c.id}>
              <div className="mb-3 flex items-center justify-between">
                <CardHeader title={c.name} />
                <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setItemDialog({ catId: c.id, item: null })}>
                  صنف
                </Button>
              </div>
              {c.items.length === 0 ? (
                <p className="text-sm text-muted">لا أصناف.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {c.items.map((i) => (
                    <div key={i.id} className="flex items-center justify-between rounded-lg border border-white/8 p-3">
                      <div>
                        <p className="font-bold text-text">
                          {i.name}{' '}
                          {!i.is_available && <span className="text-[10px] text-danger">(متوقّف)</span>}
                        </p>
                        <p className="text-sm text-gold">{money(i.price)}</p>
                        {i.options.length > 0 && (
                          <p className="text-[10px] text-muted">{i.options.length} خيارات</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" icon={<Settings2 size={14} />} onClick={() => setOptItem(i)}>
                          خيارات
                        </Button>
                        <Button size="sm" variant="ghost" icon={<BookText size={14} />} onClick={() => setRecipeItem(i)}>
                          الوصفة
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setItemDialog({ catId: c.id, item: i })}>
                          تعديل
                        </Button>
                        <button className="p-1 text-danger" onClick={() => delItem(i.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {itemDialog && (
        <ItemDialog
          catId={itemDialog.catId}
          item={itemDialog.item}
          onClose={() => setItemDialog(null)}
          onSaved={() => {
            setItemDialog(null);
            load();
          }}
        />
      )}
      {optItem && (
        <OptionsDialog
          item={optItem}
          onClose={() => setOptItem(null)}
          onChanged={() => {
            load();
            // refresh the open dialog's item from fresh menu
            restaurantApi.menu(null).then((m) => {
              const found = m.flatMap((c) => c.items).find((x) => x.id === optItem.id);
              setOptItem(found || null);
            });
          }}
        />
      )}
      {recipeItem && (
        <RecipeDialog item={recipeItem} onClose={() => setRecipeItem(null)} />
      )}
    </div>
  );
}

function RecipeDialog({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [ings, recipe] = await Promise.all([
          restaurantApi.ingredientsList(false),
          restaurantApi.recipeGet(item.id),
        ]);
        setIngredients(ings);
        const m: Record<string, string> = {};
        recipe.forEach((r) => {
          m[r.ingredient_id] = String(r.qty);
        });
        setQtys(m);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function save() {
    setBusy(true);
    try {
      const items = Object.entries(qtys)
        .map(([ingredient_id, q]) => ({ ingredient_id, qty: Number(q) || 0 }))
        .filter((x) => x.qty > 0);
      await restaurantApi.recipeSet(item.id, items);
      toast.success('تم حفظ الوصفة');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`وصفة: ${item.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={save} loading={busy}>
            حفظ الوصفة
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">
        حدّد كمية كل مادة المستهلكة لكل وحدة من هذا الصنف. تُخصم تلقائيًا عند البيع.
      </p>
      {loading ? (
        <Spinner />
      ) : ingredients.length === 0 ? (
        <p className="text-sm text-muted">لا توجد مواد بعد. أضِف مواد من صفحة مخزون المواد أولًا.</p>
      ) : (
        <div className="space-y-2">
          {ingredients.map((ing) => (
            <div key={ing.id} className="flex items-center justify-between gap-3">
              <span className="text-sm text-text">
                {ing.name} <span className="text-[11px] text-muted">({ing.unit})</span>
              </span>
              <Input
                type="number"
                step="0.001"
                className="w-28"
                placeholder="0"
                value={qtys[ing.id] ?? ''}
                onChange={(e) => setQtys((m) => ({ ...m, [ing.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function ItemDialog({
  catId,
  item,
  onClose,
  onSaved,
}: {
  catId: string;
  item: MenuItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [desc, setDesc] = useState(item?.description ?? '');
  const [available, setAvailable] = useState(item?.is_available ?? true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function save() {
    setBusy(true);
    try {
      await restaurantApi.setItem(
        item?.id ?? null,
        catId,
        name.trim(),
        Number(price) || 0,
        desc.trim() || null,
        null,
        available,
        item?.sort ?? 0
      );
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'تعديل صنف' : 'صنف جديد'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={save} loading={busy}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="الاسم">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="السعر">
          <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="الوصف (اختياري)">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
          متاح للطلب
        </label>
      </div>
    </Dialog>
  );
}

function OptionsDialog({
  item,
  onClose,
  onChanged,
}: {
  item: MenuItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [group, setGroup] = useState('إضافات');
  const [name, setName] = useState('');
  const [delta, setDelta] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await restaurantApi.setOption(null, item.id, group.trim() || 'إضافات', name.trim(), Number(delta) || 0, 0);
      setName('');
      setDelta('');
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    try {
      await restaurantApi.deleteOption(id);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`خيارات: ${item.name}`}>
      <div className="mb-4 space-y-2">
        {item.options.length === 0 ? (
          <p className="text-sm text-muted">لا خيارات بعد.</p>
        ) : (
          item.options.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg border border-white/8 p-2 text-sm">
              <span>
                <span className="text-[10px] text-muted">{o.group}</span> — {o.name}
              </span>
              <span className="flex items-center gap-2">
                {o.price_delta !== 0 && <span className="text-gold">+{money(o.price_delta)}</span>}
                <button className="p-1 text-danger" onClick={() => del(o.id)}>
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          ))
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="المجموعة">
          <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="حجم / إضافات" />
        </Field>
        <Field label="الخيار">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="كبير" />
        </Field>
        <Field label="فرق السعر">
          <Input type="number" step="0.01" value={delta} onChange={(e) => setDelta(e.target.value)} />
        </Field>
      </div>
      <Button className="mt-3" size="sm" icon={<Plus size={14} />} onClick={add} loading={busy}>
        إضافة خيار
      </Button>
    </Dialog>
  );
}
