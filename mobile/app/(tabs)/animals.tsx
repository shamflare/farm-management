import React, { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { useAnimals, useCatalog, useMe } from "../../src/api/queries";
import { age, formatNumber, money, SEX_ICON, SEX_LABEL, statusTone } from "../../src/lib/format";
import { recall, remember } from "../../src/lib/recall";
import { useTheme } from "../../src/theme/ThemeProvider";
import { DataCard } from "../../src/ui/cards";
import { Body, Chips, Header, Screen } from "../../src/ui/layout";
import { Badge, CardSkeleton, Empty, T } from "../../src/ui/primitives";

const ALL = "all";

/**
 * القطيع.
 *
 * لا جدول: كل حيوان بطاقة تُظهر رقمه وحالته واسمه وأربع حقائق. والفروع
 * تبويبات في الأعلى — تمامًا كما في اللوحة، لأن التربية والتسمين قطيعان
 * يُداران على حدة.
 */
export default function AnimalsScreen() {
  const theme = useTheme();
  const router = useRouter();

  // التبويب يبقى كما تركته: من يدير التسمين يفتح عليه لا على «الكل».
  const [tab, setTab] = useState<string>(() => recall("animals_tab", ALL));
  const [search, setSearch] = useState("");
  const [onFarm, setOnFarm] = useState("true");

  const { data: me } = useMe();
  const currency = me?.farm?.base_currency?.code ?? "USD";
  const { data: catalog } = useCatalog();
  const branches = catalog?.["branch"] ?? [];

  const { data, isLoading, refetch, isRefetching } = useAnimals({
    branch: tab === ALL ? "" : tab,
    search,
    is_on_farm: onFarm,
  });

  useEffect(() => {
    remember("animals_tab", tab);
  }, [tab]);

  const rows = data?.results ?? [];
  const tabs = useMemo(
    () => [{ id: ALL, display_name: "الكل" }, ...branches.filter((b) => b.code !== "shared")],
    [branches]
  );

  return (
    <Screen>
      <Header
        title="القطيع"
        subtitle={`${formatNumber(data?.count ?? 0)} رأس · ${
          onFarm === "true" ? "في المزرعة" : "خارج المزرعة"
        }`}
      />

      <Body onRefresh={refetch} refreshing={isRefetching}>
        {/* البحث */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث برقم الحيوان أو اسمه…"
          placeholderTextColor={theme.colors.text_muted}
          style={{
            minHeight: theme.touch,
            borderRadius: theme.radius,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingHorizontal: theme.space.lg,
            fontFamily: theme.font(),
            fontSize: theme.size("body"),
            color: theme.colors.text,
            textAlign: "right",
          }}
        />

        {/* تبويبات الفروع */}
        <Chips
          value={tab}
          onChange={setTab}
          scroll
          options={tabs.map((item) => ({ key: item.id, label: item.display_name }))}
        />

        {/* الوجود: مفتاح واحد بدل قائمة */}
        <View style={{ flexDirection: "row", gap: theme.space.sm }}>
          {[
            { key: "true", label: "في المزرعة" },
            { key: "false", label: "مباع أو نافق" },
            { key: "", label: "الكل" },
          ].map((item) => {
            const active = onFarm === item.key;
            return (
              <Pressable key={item.label} onPress={() => setOnFarm(item.key)} style={{ flex: 1 }}>
                <View
                  style={{
                    paddingVertical: 8,
                    borderRadius: theme.radius - 6,
                    alignItems: "center",
                    backgroundColor: active
                      ? theme.colors.surface
                      : theme.isDark
                      ? "transparent"
                      : "transparent",
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <T variant="micro" weight={active ? "bold" : "regular"} muted={!active}>
                    {item.label}
                  </T>
                </View>
              </Pressable>
            );
          })}
        </View>

        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : rows.length === 0 ? (
          <Empty
            title={search ? "لا نتائج" : "لا حيوانات بعد"}
            text={
              search
                ? "جرّب رقمًا آخر أو امسح البحث."
                : "الحيوانات تدخل من عملية شراء أو من تسجيل ولادة."
            }
          />
        ) : (
          rows.map((animal) => (
            <DataCard
              key={animal.id}
              id={animal.tag}
              status={animal.status_name}
              statusTone={statusTone(animal.status_code)}
              title={animal.name || animal.type_name}
              onPress={() => router.push(`/animal/${animal.id}`)}
              facts={[
                { icon: "🏠", label: animal.branch_name || "بلا فرع" },
                { icon: SEX_ICON[animal.sex], label: SEX_LABEL[animal.sex] ?? animal.sex },
                ...(animal.current_weight
                  ? [{ icon: "⚖", label: `${formatNumber(animal.current_weight, 1)} كغ` }]
                  : []),
                ...(age(animal.birth_date) ? [{ icon: "🎂", label: age(animal.birth_date) }] : []),
                // بكم دخل هذا الرأس: التكلفة الكاملة لا الثمن وحده، فهي ما
                // يُقارَن بسعر البيع.
                ...(animal.purchase
                  ? [{ icon: "💵", label: money(animal.purchase.total_cost, currency) }]
                  : []),
              ]}
            />
          ))
        )}

        {!!data && data.count > rows.length && (
          <View style={{ alignItems: "center", paddingTop: theme.space.md }}>
            <Badge label={`يُعرض ${formatNumber(rows.length)} من ${formatNumber(data.count)}`} />
          </View>
        )}
      </Body>
    </Screen>
  );
}
