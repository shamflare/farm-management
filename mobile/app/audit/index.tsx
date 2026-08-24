import React, { useState } from "react";

import { useAudit } from "../../src/api/queries";
import { formatNumber } from "../../src/lib/format";
import { DataCard } from "../../src/ui/cards";
import { Body, Chips, Header, Screen } from "../../src/ui/layout";
import { CardSkeleton, Empty } from "../../src/ui/primitives";

const ACTIONS = [
  { key: "", label: "الكل" },
  { key: "create", label: "إضافة" },
  { key: "update", label: "تعديل" },
  { key: "delete", label: "حذف" },
  { key: "post", label: "ترحيل" },
  { key: "reverse", label: "عكس" },
  { key: "login", label: "دخول" },
] as const;

const TONE: Record<string, "success" | "info" | "danger" | "warning" | "neutral"> = {
  create: "success",
  post: "success",
  approve: "success",
  update: "info",
  setting: "info",
  delete: "danger",
  void: "danger",
  reverse: "warning",
  login: "neutral",
};

/** الوقت بصيغة تُقرأ: «قبل ٣ ساعات» أوضح من طابع زمني كامل. */
function ago(value: string) {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", { dateStyle: "medium" }).format(new Date(value));
}

export default function AuditScreen() {
  const [action, setAction] = useState<string>("");
  const { data, isLoading, refetch, isRefetching } = useAudit(action);
  const rows = data?.results ?? [];

  return (
    <Screen>
      <Header
        back
        title="سجل التدقيق"
        subtitle={`${formatNumber(data?.count ?? 0)} حدث · من فعل ماذا ومتى`}
      />
      <Body onRefresh={refetch} refreshing={isRefetching}>
        <Chips value={action} onChange={setAction} options={ACTIONS as any} scroll />

        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : rows.length === 0 ? (
          <Empty title="لا أحداث" text="كل تسجيل أو تعديل يظهر هنا باسم صاحبه." />
        ) : (
          rows.map((row: any) => (
            <DataCard
              key={row.id}
              id={ago(row.created_at)}
              status={row.action_label ?? row.action}
              statusTone={TONE[row.action] ?? "neutral"}
              title={row.label || row.entity}
              facts={[
                { icon: "👤", label: row.user_name || "النظام" },
                ...(row.entity ? [{ icon: "📁", label: row.entity }] : []),
              ]}
            />
          ))
        )}
      </Body>
    </Screen>
  );
}
