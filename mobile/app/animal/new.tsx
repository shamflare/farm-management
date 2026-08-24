import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../src/api/client";
import { useCatalog, useNextTag } from "../../src/api/queries";
import { Body, Header, Screen } from "../../src/ui/layout";
import { Field, Note, Picker } from "../../src/ui/forms";
import { Button, Card, T } from "../../src/ui/primitives";
import { useTheme } from "../../src/theme/ThemeProvider";

/**
 * حيوان جديد.
 *
 * الرقم يُقترح من الخادم حسب الفرع (كل فرع يعدّ من واحد)، فلا يحفظ أحد آخر
 * رقم استعمله. وتغيير الفرع يُغيّر الرقم المقترح ولا يمسّ رقمًا كتبه المستخدم.
 */
export default function NewAnimalScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const { data: catalog } = useCatalog();

  const [form, setForm] = useState({
    tag: "",
    name: "",
    branch: "",
    animal_type: "",
    breed: "",
    status: "",
    sex: "female",
    birth_date: "",
  });
  const [touchedTag, setTouchedTag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const branches = (catalog?.["branch"] ?? []).filter((item) => item.code !== "shared");
  const types = catalog?.["animal_type"] ?? [];
  const breeds = catalog?.["breed"] ?? [];
  const statuses = catalog?.["animal_status"] ?? [];

  // الافتراضات تُملأ حالما تصل القوائم: نموذج نصفه مملوء أسرع من نموذج فارغ.
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      branch: prev.branch || branches.find((b) => b.code === "breeding")?.id || branches[0]?.id || "",
      animal_type: prev.animal_type || types[0]?.id || "",
      status: prev.status || statuses.find((s) => s.code === "active")?.id || statuses[0]?.id || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const { data: suggested } = useNextTag(form.animal_type, form.branch);

  useEffect(() => {
    if (suggested && !touchedTag) setForm((prev) => ({ ...prev, tag: suggested }));
  }, [suggested, touchedTag]);

  async function submit() {
    if (!form.tag.trim()) return setError("رقم الحيوان مطلوب");
    setBusy(true);
    setError("");
    try {
      const animal = await api.post<any>("/animals/", {
        ...form,
        tag: form.tag.trim(),
        branch: form.branch || null,
        breed: form.breed || null,
        birth_date: form.birth_date || null,
        acquisition: "born",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await client.invalidateQueries();
      setNote(`أُضيف ${animal.tag}`);
      router.replace(`/animal/${animal.id}`);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(err.message ?? "تعذّرت الإضافة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header back title="حيوان جديد" subtitle="الرقم يُقترح حسب الفرع" />
      <Body>
        <Card style={{ gap: theme.space.lg }}>
          <Field
            label="رقم الحيوان"
            big
            value={form.tag}
            onChangeText={(value) => {
              setTouchedTag(true);
              setForm({ ...form, tag: value });
            }}
            placeholder="TR-0001"
          />

          <Picker
            label="الفرع"
            value={form.branch}
            onChange={(value) => setForm({ ...form, branch: value })}
            options={branches.map((item) => ({ id: item.id, display_name: item.display_name }))}
          />

          <Picker
            label="النوع"
            value={form.animal_type}
            onChange={(value) => setForm({ ...form, animal_type: value })}
            options={types.map((item) => ({ id: item.id, display_name: item.display_name }))}
          />

          <Picker
            label="الجنس"
            value={form.sex}
            onChange={(value) => setForm({ ...form, sex: value })}
            options={[
              { id: "female", display_name: "أنثى" },
              { id: "male", display_name: "ذكر" },
            ]}
          />

          {!!breeds.length && (
            <Picker
              label="السلالة"
              value={form.breed}
              onChange={(value) => setForm({ ...form, breed: value })}
              options={[{ id: "", display_name: "بلا سلالة" }, ...breeds.map((item) => ({
                id: item.id,
                display_name: item.display_name,
              }))]}
            />
          )}

          <Field
            label="الاسم"
            placeholder="اختياري"
            value={form.name}
            onChangeText={(value) => setForm({ ...form, name: value })}
          />

          <Field
            label="تاريخ الميلاد"
            placeholder="2026-03-01"
            hint="اتركه فارغًا إن لم يكن معروفًا"
            value={form.birth_date}
            onChangeText={(value) => setForm({ ...form, birth_date: value })}
          />

          <Note text={error} tone="danger" />
          <Note text={note} tone="success" />

          <Button title={busy ? "جارٍ الحفظ…" : "حفظ الحيوان"} onPress={submit} busy={busy} />
        </Card>

        <T variant="micro" muted style={{ textAlign: "center" }}>
          الشراء بعدة رؤوس وبقيده المالي يُسجَّل من اللوحة
        </T>
      </Body>
    </Screen>
  );
}
