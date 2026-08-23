import React from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useAnimal, useTimeline } from "../../src/api/queries";
import { age, formatDate, formatNumber, SEX_LABEL, statusTone } from "../../src/lib/format";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Badge, Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

/**
 * ملف الحيوان.
 *
 * البطاقة في القائمة تقول ما يُعرف بلمحة؛ هذه الصفحة تقول الباقي: حقائقه
 * كاملة، وسجله الزمني من أول يوم.
 */
export default function AnimalScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: animal, isLoading, refetch, isRefetching } = useAnimal(String(id));
  const { data: events } = useTimeline(String(id));

  return (
    <Screen>
      <Header
        title={animal?.tag ?? "…"}
        subtitle={animal?.name || animal?.type_name}
        right={
          <Pressable
            onPress={() => router.back()}
            style={{
              paddingHorizontal: theme.space.lg,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: alpha("#FFFFFF", 0.18),
            }}
          >
            <T variant="small" weight="bold" color="#FFFFFF">
              رجوع
            </T>
          </Pressable>
        }
      />

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
                <Badge
                  label={animal.status_name}
                  tone={statusTone(animal.status_code)}
                  solid
                />
              </View>

              <View style={{ gap: theme.space.sm }}>
                <Fact label="الفرع" value={animal.branch_name || "غير محدد"} />
                <Fact label="النوع" value={animal.type_name} />
                <Fact label="السلالة" value={animal.breed_name || "—"} />
                <Fact label="الجنس" value={SEX_LABEL[animal.sex] ?? animal.sex} />
                <Fact
                  label="العمر"
                  value={age(animal.birth_date) || formatDate(animal.birth_date)}
                />
                <Fact
                  label="الوزن"
                  value={
                    animal.current_weight ? `${formatNumber(animal.current_weight, 1)} كغ` : "—"
                  }
                />
                <Fact label="الموقع" value={animal.location_name || "—"} />
              </View>
            </Card>

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
