import React, { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../src/api/client";
import { useAnimal, useCan, useCatalog, useMe, useTimeline } from "../../src/api/queries";
import { age, formatDate, formatNumber, money, SEX_LABEL, statusTone, today } from "../../src/lib/format";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Field, Note, Picker } from "../../src/ui/forms";
import { Badge, Button, Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

type Action = "edit" | "weight" | "health" | "birth" | "death" | null;

/**
 * ملف الحيوان، وكل ما يُفعل به.
 *
 * البطاقة في القائمة تقول ما يُعرف بلمحة؛ هذه الصفحة تقول الباقي وتفتح ما
 * يُسجَّل واليد على الحيوان: تعديل بياناته، وزنه، لقاحه، ولادته، نفوقه —
 * وحذف سجله إن لم يكن خلفه حيوان أصلًا.
 */
export default function AnimalScreen() {
  const theme = useTheme();
  const can = useCan();
  const router = useRouter();
  const client = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: me } = useMe();
  const { data: animal, isLoading, refetch, isRefetching } = useAnimal(String(id));
  const { data: events } = useTimeline(String(id));
  const { data: catalog } = useCatalog();
  const currency = me?.farm?.base_currency?.code ?? "USD";

  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  // نموذج التعديل يُملأ من الحيوان نفسه لحظة فتحه، لا يُترك فارغًا ليُعاد كتابته.
  useEffect(() => {
    if (action === "edit" && animal) {
      setForm({
        tag: animal.tag ?? "",
        name: animal.name ?? "",
        animal_type: (animal as any).animal_type ?? "",
        breed: (animal as any).breed ?? "",
        location: (animal as any).location ?? "",
        sex: animal.sex ?? "female",
        birth_date: animal.birth_date ?? "",
        entered_at: animal.entered_at ?? "",
        color: animal.color ?? "",
        ear_tag: animal.ear_tag ?? "",
        chip_number: animal.chip_number ?? "",
        purchase_price: animal.purchase_price ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, animal?.id]);

  function open(next: Action) {
    setAction(action === next ? null : next);
    if (action !== next) setForm({});
    setError("");
    setNote("");
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (action === "edit") {
        if (!form.tag?.trim()) throw new Error("رقم الحيوان مطلوب");
        await api.patch(`/animals/${id}/`, {
          tag: form.tag.trim(),
          name: form.name ?? "",
          animal_type: form.animal_type || undefined,
          breed: form.breed || null,
          location: form.location || null,
          sex: form.sex,
          birth_date: form.birth_date || null,
          entered_at: form.entered_at || null,
          color: form.color ?? "",
          ear_tag: form.ear_tag ?? "",
          chip_number: form.chip_number ?? "",
          // ثمن رأس دخل بصفقة يقرؤه المستند، فلا يُرسل من هنا أصلًا.
          ...(animal?.purchase ? {} : { purchase_price: form.purchase_price || null }),
        });
        setNote("حُفظت البيانات");
      } else if (action === "weight") {
        const value = Number(form.weight);
        if (!value) throw new Error("اكتب الوزن بالكيلوغرام");
        await api.post("/weights/", { animal: id, weight_kg: value, happened_on: today() });
        setNote(`سُجّل وزن ${value} كغ`);
      } else if (action === "health") {
        if (!form.title?.trim()) throw new Error("اكتب اسم اللقاح أو العلاج");
        await api.post("/health-records/", {
          animal: id,
          kind: "vaccine",
          happened_on: today(),
          title: form.title.trim(),
          notes: form.notes ?? "",
        });
        setNote("سُجّل في السجل الصحي");
      } else if (action === "birth") {
        const count = Number(form.count || 1);
        if (!count || count < 1) throw new Error("عدد المواليد واحد على الأقل");
        await api.post("/births/", {
          mother: id,
          happened_on: today(),
          offspring: Array.from({ length: count }, () => ({ sex: form.sex || "female" })),
          stillborn: Number(form.stillborn || 0),
          notes: form.notes ?? "",
        });
        setNote(`سُجّلت ولادة ${count} مولود`);
      } else if (action === "death") {
        await api.post("/ops/death/", {
          animal: id,
          date: today(),
          reason: form.reason || null,
          notes: form.notes ?? "",
        });
        setNote("سُجّل النفوق، وخرج الحيوان من القطيع");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await client.invalidateQueries();
      setAction(null);
      setForm({});
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(err.message ?? "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  /**
   * حذف السجل — لا نفوق.
   *
   * الفرق ليس في الشكل: النفوق واقعة تُسجَّل في الدفتر، والحذف تصحيح لسجل لا
   * يقابله حيوان. السؤال يُطرح بهذه الكلمات كي لا يُخلط بينهما.
   */
  function confirmDelete() {
    Alert.alert(
      `حذف سجل ${animal?.tag}`,
      "لسجل أُدخل بالخطأ أو تكرّر. يختفي من كل الشاشات، ولا يُكتب قيد مالي.\n\nإن كان الحيوان قد نفق فعلًا فاستعمل «نفوق» بدل الحذف.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف السجل",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/animals/${id}/`);
              await client.invalidateQueries();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              router.back();
            } catch (err: any) {
              setError(err.message ?? "تعذّر الحذف");
            }
          },
        },
      ]
    );
  }

  const actions: { key: Exclude<Action, null>; label: string; icon: string; permission: string; when: boolean }[] = [
    { key: "edit", label: "تعديل", icon: "✏️", permission: "animals.edit", when: true },
    { key: "weight", label: "وزن", icon: "⚖", permission: "animals.edit", when: !!animal?.is_on_farm },
    { key: "health", label: "لقاح", icon: "💉", permission: "health.create", when: !!animal?.is_on_farm },
    { key: "birth", label: "ولادة", icon: "🐑", permission: "births.create", when: animal?.sex === "female" && !!animal?.is_on_farm },
    { key: "death", label: "نفوق", icon: "⚠️", permission: "finance.create", when: !!animal?.is_on_farm },
  ];

  const branches = (catalog?.["branch"] ?? []).filter((item) => item.code !== "shared");

  return (
    <Screen>
      <Header back title={animal?.tag ?? "…"} subtitle={animal?.name || animal?.type_name} />

      <Body onRefresh={refetch} refreshing={isRefetching}>
        {isLoading && !animal ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : !animal ? (
          <Empty title="تعذّر فتح الملف" text="تأكد من الاتصال ثم اسحب للتحديث." />
        ) : (
          <>
            <Card style={{ gap: theme.space.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
                <T variant="title" weight="bold" style={{ flex: 1 }}>
                  {animal.name || "بلا اسم"}
                </T>
                <Badge label={animal.status_name} tone={statusTone(animal.status_code)} solid />
              </View>

              <View style={{ gap: theme.space.sm }}>
                <Fact label="الفرع" value={animal.branch_name || "غير محدد"} />
                <Fact label="النوع" value={animal.type_name} />
                <Fact label="السلالة" value={animal.breed_name || "—"} />
                <Fact label="الجنس" value={SEX_LABEL[animal.sex] ?? animal.sex} />
                <Fact label="العمر" value={age(animal.birth_date) || formatDate(animal.birth_date)} />
                <Fact
                  label="الوزن"
                  value={animal.current_weight ? `${formatNumber(animal.current_weight, 1)} كغ` : "—"}
                />
                <Fact label="الموقع" value={animal.location_name || "—"} />
              </View>
            </Card>

            {/* من أين جاء هذا الرأس وبكم */}
            <Card style={{ gap: theme.space.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <T weight="bold" style={{ flex: 1 }}>
                  كيف دخل
                </T>
                <Badge label={animal.acquisition_label ?? "—"} />
              </View>
              <Fact label="تاريخ الدخول" value={formatDate(animal.entered_at)} />
              {animal.purchase ? (
                <>
                  <Fact label="المورد" value={animal.purchase.supplier_name || "—"} />
                  <Fact label="سعر الشراء" value={money(animal.purchase.unit_price, currency)} />
                  <Fact label="التكلفة الكاملة" value={money(animal.purchase.total_cost, currency)} />
                  <T variant="micro" muted>
                    التكلفة الكاملة = الثمن + حصّته من النقل والعمولة
                  </T>
                </>
              ) : (
                <Fact
                  label="سعر الشراء"
                  value={animal.purchase_price ? money(animal.purchase_price, currency) : "—"}
                />
              )}
            </Card>

            <Section title="ماذا تريد أن تفعل" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>
              {actions
                .filter((item) => item.when && can(item.permission))
                .map((item) => (
                  <Card
                    key={item.key}
                    onPress={() => open(item.key)}
                    style={{
                      flexGrow: 1,
                      flexBasis: 90,
                      alignItems: "center",
                      gap: 4,
                      paddingVertical: theme.space.md,
                      borderColor: action === item.key ? theme.colors.primary : theme.colors.border,
                      backgroundColor:
                        action === item.key
                          ? alpha(theme.colors.primary, theme.isDark ? 0.2 : 0.08)
                          : theme.colors.surface,
                    }}
                  >
                    <T variant="title">{item.icon}</T>
                    <T variant="micro" weight={action === item.key ? "bold" : "regular"} muted>
                      {item.label}
                    </T>
                  </Card>
                ))}
              {can("animals.delete") && (
                <Card
                  onPress={confirmDelete}
                  style={{
                    flexGrow: 1,
                    flexBasis: 90,
                    alignItems: "center",
                    gap: 4,
                    paddingVertical: theme.space.md,
                    borderColor: alpha(theme.colors.danger, 0.4),
                  }}
                >
                  <T variant="title">🗑️</T>
                  <T variant="micro" muted>
                    حذف السجل
                  </T>
                </Card>
              )}
            </View>

            {!!action && (
              <Card style={{ gap: theme.space.lg }}>
                {action === "edit" && (
                  <>
                    <Field
                      label="رقم الحيوان"
                      value={form.tag ?? ""}
                      onChangeText={(value) => set("tag", value)}
                      hint="هو ما يُنادى به في السجل كله"
                    />
                    <Field
                      label="الاسم"
                      placeholder="اختياري"
                      value={form.name ?? ""}
                      onChangeText={(value) => set("name", value)}
                    />
                    <Picker
                      label="النوع"
                      value={form.animal_type ?? ""}
                      onChange={(value) => set("animal_type", value)}
                      options={(catalog?.["animal_type"] ?? []).map((item) => ({
                        id: item.id,
                        display_name: item.display_name,
                      }))}
                    />
                    <Picker
                      label="الجنس"
                      value={form.sex ?? "female"}
                      onChange={(value) => set("sex", value)}
                      options={[
                        { id: "female", display_name: "أنثى" },
                        { id: "male", display_name: "ذكر" },
                        { id: "unknown", display_name: "غير محدد" },
                      ]}
                    />
                    {!!(catalog?.["breed"] ?? []).length && (
                      <Picker
                        label="السلالة"
                        value={form.breed ?? ""}
                        onChange={(value) => set("breed", value)}
                        options={[
                          { id: "", display_name: "بلا سلالة" },
                          ...(catalog?.["breed"] ?? []).map((item) => ({
                            id: item.id,
                            display_name: item.display_name,
                          })),
                        ]}
                      />
                    )}
                    {!!(catalog?.["location"] ?? []).length && (
                      <Picker
                        label="الموقع"
                        value={form.location ?? ""}
                        onChange={(value) => set("location", value)}
                        options={[
                          { id: "", display_name: "غير محدد" },
                          ...(catalog?.["location"] ?? []).map((item) => ({
                            id: item.id,
                            display_name: item.display_name,
                          })),
                        ]}
                      />
                    )}
                    <Field
                      label="تاريخ الميلاد"
                      placeholder="2026-03-01"
                      value={form.birth_date ?? ""}
                      onChangeText={(value) => set("birth_date", value)}
                    />
                    <Field
                      label="تاريخ الدخول"
                      placeholder="2026-03-01"
                      value={form.entered_at ?? ""}
                      onChangeText={(value) => set("entered_at", value)}
                    />
                    <Field
                      label="اللون"
                      value={form.color ?? ""}
                      onChangeText={(value) => set("color", value)}
                    />
                    <Field
                      label="رقم الأذن"
                      value={form.ear_tag ?? ""}
                      onChangeText={(value) => set("ear_tag", value)}
                    />
                    <Field
                      label="رقم الشريحة"
                      value={form.chip_number ?? ""}
                      onChangeText={(value) => set("chip_number", value)}
                    />
                    {animal.purchase ? (
                      <T variant="micro" muted>
                        سعر الشراء يُعدَّل من صفحة الشراء، ليبقى الدفتر وملف الحيوان رقمًا واحدًا.
                      </T>
                    ) : (
                      <Field
                        label="سعر الشراء"
                        keyboardType="decimal-pad"
                        value={String(form.purchase_price ?? "")}
                        onChangeText={(value) => set("purchase_price", value)}
                        hint="لمولود أو لرأس كان موجودًا عند البدء — لا يُنشئ قيدًا"
                      />
                    )}
                  </>
                )}

                {action === "weight" && (
                  <Field
                    label="الوزن بالكيلوغرام"
                    big
                    keyboardType="decimal-pad"
                    placeholder="0"
                    value={form.weight ?? ""}
                    onChangeText={(value) => set("weight", value)}
                  />
                )}

                {action === "health" && (
                  <>
                    <Field
                      label="اللقاح أو العلاج"
                      placeholder="مثال: لقاح الحمى القلاعية"
                      value={form.title ?? ""}
                      onChangeText={(value) => set("title", value)}
                    />
                    <Field
                      label="ملاحظة"
                      placeholder="اختيارية"
                      value={form.notes ?? ""}
                      onChangeText={(value) => set("notes", value)}
                    />
                  </>
                )}

                {action === "birth" && (
                  <>
                    <Field
                      label="عدد المواليد الأحياء"
                      big
                      keyboardType="number-pad"
                      placeholder="1"
                      value={form.count ?? ""}
                      onChangeText={(value) => set("count", value)}
                    />
                    <Picker
                      label="جنس المواليد"
                      value={form.sex ?? "female"}
                      onChange={(value) => set("sex", value)}
                      options={[
                        { id: "female", display_name: "إناث" },
                        { id: "male", display_name: "ذكور" },
                      ]}
                    />
                    <Field
                      label="عدد الأموات عند الولادة"
                      keyboardType="number-pad"
                      placeholder="0"
                      value={form.stillborn ?? ""}
                      onChangeText={(value) => set("stillborn", value)}
                    />
                  </>
                )}

                {action === "death" && (
                  <>
                    <Picker
                      label="السبب"
                      value={form.reason ?? ""}
                      onChange={(value) => set("reason", value)}
                      options={(catalog?.["death_reason"] ?? []).map((item) => ({
                        id: item.id,
                        display_name: item.display_name,
                      }))}
                    />
                    <Field
                      label="ملاحظة"
                      placeholder="اختيارية"
                      value={form.notes ?? ""}
                      onChangeText={(value) => set("notes", value)}
                    />
                    <T variant="micro" color={theme.colors.danger}>
                      سيخرج الحيوان من القطيع وتُسجَّل خسارته في الدفتر.
                    </T>
                  </>
                )}

                <Note text={error} tone="danger" />
                <Button
                  title={busy ? "جارٍ الحفظ…" : "حفظ"}
                  onPress={submit}
                  busy={busy}
                  variant={action === "death" ? "danger" : "primary"}
                />
              </Card>
            )}

            <Note text={note} tone="success" />

            <Section title="السجل الزمني" />
            {!events?.length ? (
              <Empty title="لا أحداث بعد" text="الولادات والأوزان واللقاحات تظهر هنا." />
            ) : (
              events.map((event: any, index: number) => (
                <Card key={index} style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: theme.colors.primary,
                      }}
                    />
                    <T weight="bold" style={{ flex: 1 }} numberOfLines={1}>
                      {event.title ?? event.label ?? event.event_type}
                    </T>
                    <T variant="micro" muted>
                      {formatDate(event.happened_on ?? event.date)}
                    </T>
                  </View>
                  {!!event.detail && (
                    <T variant="small" muted>
                      {event.detail}
                    </T>
                  )}
                </Card>
              ))
            )}

            {branches.length > 1 && animal.is_on_farm && can("animals.edit") && (
              <T variant="micro" muted style={{ textAlign: "center" }}>
                نقل الحيوان بين الفروع يتم من اللوحة — النقل حدث يُسجَّل في تاريخه.
              </T>
            )}
          </>
        )}
      </Body>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
      <T variant="small" muted style={{ width: 86 }}>
        {label}
      </T>
      <T variant="small" weight="medium" style={{ flex: 1 }} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}
