import React, { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../src/api/client";
import { useCan, useCatalogItems, useCatalogTypes } from "../../src/api/queries";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Body, Chips, Header, Screen, Section } from "../../src/ui/layout";
import { Badge, Button, Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

/**
 * القوائم والبنود.
 *
 * الفروع وأنواع الحيوانات وبنود المصروف: بيانات لا شيفرة. تُضاف من الجوال
 * لأن الحاجة إلى بند جديد تظهر لحظة التسجيل، لا لاحقًا أمام الحاسوب.
 */
export default function ListsScreen() {
  const theme = useTheme();
  const can = useCan();
  const client = useQueryClient();

  const { data: types } = useCatalogTypes();
  const [active, setActive] = useState<string>("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active && types?.length) setActive(types[0].code ?? types[0].id);
  }, [types, active]);

  const { data, isLoading, refetch, isRefetching } = useCatalogItems(active);
  const rows = data?.results ?? [];
  const editable = can("settings.edit");

  async function addItem() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/catalog/", { type: active, name_ar: name.trim(), name: name.trim() });
      await client.invalidateQueries();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setName("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header back title="القوائم والبنود" subtitle="ما تختار منه كل النماذج" />
      <Body onRefresh={refetch} refreshing={isRefetching}>
        {!!types?.length && (
          <Chips
            value={active}
            onChange={setActive}
            scroll
            options={types.map((type: any) => ({
              key: type.code ?? type.id,
              label: type.name_ar || type.name,
            }))}
          />
        )}

        {editable && (
          <Card style={{ gap: theme.space.md }}>
            <T variant="small" weight="bold" muted>
              إضافة بند جديد
            </T>
            <View style={{ flexDirection: "row", gap: theme.space.sm }}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="اسم البند"
                placeholderTextColor={theme.colors.text_muted}
                style={{
                  flex: 1,
                  minHeight: theme.touch,
                  borderRadius: theme.radius - 6,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.background,
                  paddingHorizontal: theme.space.lg,
                  fontFamily: theme.font(),
                  fontSize: theme.size("body"),
                  color: theme.colors.text,
                  textAlign: "right",
                }}
              />
              <Button title="إضافة" onPress={addItem} busy={busy} style={{ paddingHorizontal: 20 }} />
            </View>
            {!!error && (
              <T variant="small" color={theme.colors.danger}>
                {error}
              </T>
            )}
          </Card>
        )}

        <Section title={`${rows.length} بند`} />

        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : rows.length === 0 ? (
          <Empty title="لا بنود في هذه القائمة" />
        ) : (
          rows.map((item) => (
            <Card
              key={item.id}
              style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: alpha(theme.colors.primary, 0.7),
                }}
              />
              <T weight="medium" style={{ flex: 1 }} numberOfLines={1}>
                {item.display_name}
              </T>
              {!!item.code && <Badge label={item.code} />}
            </Card>
          ))
        )}
      </Body>
    </Screen>
  );
}
