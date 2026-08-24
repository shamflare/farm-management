import React, { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import { api } from "../../src/api/client";
import { useAnimal, useCan, useCatalog, useTimeline } from "../../src/api/queries";
import { useQueryClient } from "@tanstack/react-query";
import { age, formatDate, formatNumber, SEX_LABEL, statusTone, today } from "../../src/lib/format";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Field, Note, Picker } from "../../src/ui/forms";
import { Badge, Button, Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

type Action = "weight" | "health" | "birth" | "death" | null;

/**
 * ملف الحيوان، وما يُسجَّل عليه في الحظيرة.
 *
 * البطاقة في القائمة تقول ما يُعرف بلمحة؛ هذه الصفحة تقول الباقي وتفتح
 * الأفعال الأربعة التي تحدث ويد صاحبها على الحيوان: وزن، لقاح، ولادة، نفوق.
 */
export default function AnimalScreen() {
  const theme = useTheme();
  const can = useCan();
  const client = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: animal, isLoading, refetch, isRefetching } = useAnimal(String(id));
  const { data: events } = useTimeline(String(id));
  const { data: catalog } = useCatalog();

  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  function open(next: Action) {
    setAction(action === next ? null : next);
    setForm({});
    setError("");
    setNote("");
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (action === "weight") {
        const value = Number(form.weight);
        if (!value) throw new Error("اكتب الوزن بالكيلوغرام");
        await api.post("/weights/", { animal: id, weight_kg: value, happened_on: today() });
        setNote(`سُجّل وزن ${value} كغ`);
      } else if (action === "health") {
        if (!form.title?.trim()) throw new Error("اكتب اسم اللقاح أو العلاج");
        await api.post("/health/", {
          animal: id,
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
      setError(err.message ?? "تعذّر التسجيل");
    } finally {
      setBusy(false);
    }
  }

  const actions: { key: Exclude<Action, null>; label: string; icon: string; permission: string }[] = [
    { key: "weight", label: "وزن", icon: "⚖", permission: "animals.edit" },
    { key: "health", label: "لقاح", icon: "💉", permission: "health.create" },
    { key: "birth", label: "ولادة", icon: "🐑", permission: "births.create" },
    { key: "death", label: "نفوق", icon: "⚠️", permission: "finance.create" },
  ];

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

            {animal.is_on_farm && (
              <>
                <Section title="تسجيل على هذا الحيوان" />
                <View style={{ flexDirection: "row", gap: theme.space.sm }}>
                  {actions
                    .filter((item) => can(item.permission))
                    .map((item) => (
                      <Card
                        key={item.key}
                        onPress={() => open(item.key)}
                        style={{
                          flex: 1,
                          alignItems: "center",
                          gap: 4,
                          paddingVertical: theme.space.md,
                          borderColor:
                            action === item.key ? theme.colors.primary : theme.colors.border,
                        }}
                      >
                        <T variant="title">{item.icon}</T>
                        <T variant="micro" weight={action === item.key ? "bold" : "regular"} muted>
                          {item.label}
                        </T>
                      </Card>
                    ))}
                </View>

                {!!action && (
                  <Card style={{ gap: theme.space.lg }}>
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
              </>
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
                      {event.label ?? event.kind_label ?? event.kind}
                    </T>
                    <T variant="micro" muted>
                      {formatDate(event.happened_on ?? event.date)}
                    </T>
                  </View>
                  {!!event.notes && (
                    <T variant="small" muted>
                      {event.notes}
                    </T>
                  )}
                </Card>
              ))
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
      <T variant="small" muted style={{ width: 76 }}>
        {label}
      </T>
      <T variant="small" weight="medium" style={{ flex: 1 }} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}
