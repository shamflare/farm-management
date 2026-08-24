import React from "react";
import { View } from "react-native";

import { useMe, useMembers } from "../../src/api/queries";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Body, Header, Screen } from "../../src/ui/layout";
import { Badge, Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

const KIND_LABEL: Record<string, string> = {
  supplier: "مورد",
  customer: "زبون",
  worker: "عامل",
  partner: "شريك",
  other: "أخرى",
};

/**
 * المستخدمون.
 *
 * للقراءة هنا: من يدخل النظام وبأي دور وهل حسابه مفعّل. إنشاء الحسابات
 * وتغيير الأدوار يبقى على اللوحة — قرار يُتّخذ مرة، وخطؤه يفتح النظام لمن لا
 * يجب أن يفتحه.
 */
export default function UsersScreen() {
  const theme = useTheme();
  const { data: me } = useMe();
  const { data, isLoading, refetch, isRefetching } = useMembers();
  const rows = data?.results ?? [];

  return (
    <Screen>
      <Header back title="المستخدمون" subtitle={`${data?.count ?? 0} حساب دخول`} />
      <Body onRefresh={refetch} refreshing={isRefetching}>
        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : rows.length === 0 ? (
          <Empty title="لا مستخدمين" />
        ) : (
          rows.map((member: any) => {
            const isMe = member.user?.id === me?.user?.id;
            const initials = (member.user?.full_name || member.user?.username || "؟")
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((word: string) => word[0])
              .join("");
            return (
              <Card
                key={member.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.space.md,
                  opacity: member.is_active ? 1 : 0.6,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 15,
                    backgroundColor: alpha(theme.colors.primary, theme.isDark ? 0.24 : 0.1),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <T weight="bold" color={theme.colors.primary}>
                    {initials}
                  </T>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <T weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {member.user?.full_name || member.user?.username}
                    </T>
                    {isMe && <Badge label="أنت" tone="primary" />}
                  </View>
                  <T variant="micro" muted numberOfLines={1}>
                    {member.user?.username}
                    {member.party ? ` · ${KIND_LABEL[member.party.kind] ?? ""} ${member.party.name}` : ""}
                  </T>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Badge label={member.role?.display_name ?? "—"} />
                  {!member.is_active && <Badge label="موقوف" tone="danger" />}
                </View>
              </Card>
            );
          })
        )}

        <Card>
          <T variant="small" muted>
            إنشاء حساب جديد أو تغيير دور أو كلمة مرور شخص آخر يتم من اللوحة:
            قرارات تُتّخذ مرة، وخطؤها يفتح النظام لمن لا يجب.
          </T>
        </Card>
      </Body>
    </Screen>
  );
}
