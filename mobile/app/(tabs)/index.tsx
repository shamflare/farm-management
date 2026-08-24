import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { useAlerts, useDashboard, useMe } from "../../src/api/queries";
import { formatNumber, shortMoney } from "../../src/lib/format";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { StatCard, StatGrid } from "../../src/ui/cards";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Badge, Card, CardSkeleton, T } from "../../src/ui/primitives";

const PERIODS = [
  { key: "today", label: "اليوم" },
  { key: "week", label: "الأسبوع" },
  { key: "month", label: "الشهر" },
  { key: "year", label: "السنة" },
] as const;

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [period, setPeriod] = useState<string>("month");

  const { data: me } = useMe();
  const { data, isLoading, refetch, isRefetching } = useDashboard(period);
  const { data: alerts } = useAlerts();

  const currency = me?.farm?.base_currency?.code ?? "USD";
  const money = data?.money;

  return (
    <Screen>
      <Header
        title={me?.farm?.name ?? "مزرعتي"}
        subtitle={`أهلًا ${me?.user?.full_name ?? ""}`}
        right={
          alerts?.length ? (
            <Pressable onPress={() => router.push("/(tabs)/more")}>
              <View
                style={{
                  paddingHorizontal: theme.space.md,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: alpha("#FFFFFF", 0.18),
                }}
              >
                <T variant="small" weight="bold" color="#FFFFFF">
                  🔔 {formatNumber(alerts.length)}
                </T>
              </View>
            </Pressable>
          ) : null
        }
      />

      <Body onRefresh={refetch} refreshing={isRefetching}>
        {/* الفترة: شريط أقراص يتحرّك، لا قائمة منسدلة تحتاج نقرتين */}
        <View style={{ flexDirection: "row", gap: theme.space.sm, flexWrap: "wrap" }}>
          {PERIODS.map((item) => {
            const active = period === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setPeriod(item.key)}
                style={{
                  paddingHorizontal: theme.space.lg,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                }}
              >
                <T
                  variant="small"
                  weight={active ? "bold" : "regular"}
                  color={active ? "#FFFFFF" : theme.colors.text_muted}
                >
                  {item.label}
                </T>
              </Pressable>
            );
          })}
        </View>

        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <StatGrid>
              <StatCard
                label="النقد المتوفر"
                onPress={() => router.push("/money")}
                value={shortMoney(money?.cash_on_hand, currency)}
                icon="💵"
                tone="primary"
              />
              <StatCard
                label="صافي الربح"
                onPress={() => router.push("/reports")}
                value={shortMoney(money?.net_profit, currency)}
                icon="📈"
                tone={(money?.net_profit ?? 0) >= 0 ? "success" : "danger"}
                hint={`دخل ${shortMoney(money?.income, currency)}`}
              />
              <StatCard
                label="في المزرعة"
                onPress={() => router.push("/(tabs)/animals")}
                value={formatNumber(data?.animals?.on_farm ?? 0)}
                icon="🐑"
                hint="رأس"
              />
              <StatCard
                label="حليب الفترة"
                onPress={() => router.push("/milk")}
                value={`${formatNumber(data?.milk?.liters_produced ?? 0)} ل`}
                icon="🥛"
                tone="info"
                hint={`معدّل ${formatNumber(data?.milk?.daily_average ?? 0, 1)} يوميًا`}
              />
            </StatGrid>

            {!!data?.branches?.length && (
              <>
                <Section title="الفروع" />
                {data.branches
                  .filter((branch) => branch.code !== "shared")
                  .map((branch) => (
                    <Card key={branch.code} style={{ gap: theme.space.sm }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <T variant="title" weight="bold" style={{ flex: 1 }}>
                          {branch.name}
                        </T>
                        <Badge
                          label={`${formatNumber(branch.animals_on_farm)} رأس`}
                          tone="primary"
                        />
                      </View>
                      <T
                        variant="heading"
                        weight="bold"
                        color={branch.net_profit >= 0 ? theme.colors.success : theme.colors.danger}
                      >
                        {shortMoney(branch.net_profit, currency)}
                      </T>
                      <T variant="micro" muted>
                        صافي ربح الفرع في الفترة المختارة
                      </T>
                    </Card>
                  ))}
              </>
            )}

            {!!alerts?.length && (
              <>
                <Section title="يحتاج انتباهك" />
                {alerts.slice(0, 5).map((alert, index) => (
                  <Card key={index} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor:
                            alert.severity === "danger"
                              ? theme.colors.danger
                              : alert.severity === "warning"
                              ? theme.colors.warning
                              : theme.colors.info,
                        }}
                      />
                      <T weight="bold" style={{ flex: 1 }}>
                        {alert.title}
                      </T>
                    </View>
                    {!!alert.detail && (
                      <T variant="small" muted>
                        {alert.detail}
                      </T>
                    )}
                  </Card>
                ))}
              </>
            )}

            <StatGrid>
              <StatCard
                label="لنا عند الناس"
                onPress={() => router.push("/parties")}
                value={shortMoney(money?.owed_to_farm, currency)}
                icon="📥"
                tone="success"
              />
              <StatCard
                label="علينا للناس"
                onPress={() => router.push("/parties")}
                value={shortMoney(money?.owed_by_farm, currency)}
                icon="📤"
                tone="warning"
              />
            </StatGrid>
          </>
        )}
      </Body>
    </Screen>
  );
}
