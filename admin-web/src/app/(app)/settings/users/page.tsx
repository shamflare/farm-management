"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Icon from "@/components/Icon";
import {
  Button,
  ErrorNote,
  PageHeader,
  SuccessNote,
  TableMessage,
} from "@/components/ui";

type Role = { id: string; code: string; display_name: string };
type Member = {
  id: string;
  user: { id: string; username: string; full_name: string; phone: string; is_active: boolean };
  role: Role;
  is_active: boolean;
  party: { id: string; name: string; kind: string } | null;
};
type Party = { id: string; name: string; kind: string };
type Page<T> = { count: number; results: T[] };

const KIND_LABEL: Record<string, string> = {
  supplier: "مورد",
  customer: "عميل",
  worker: "عامل / مشرف",
  partner: "شريك",
  other: "أخرى",
};

export default function UsersPage() {
  const { can, me } = useApp();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const [memberRows, roleRows, partyRows] = await Promise.all([
      api.get<Page<Member>>("/members/?page_size=100"),
      api.get<Page<Role>>("/roles/?page_size=50"),
      api.get<Page<Party>>("/parties/?page_size=200"),
    ]);
    setMembers(memberRows.results);
    setRoles(roleRows.results);
    setParties(partyRows.results);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function changeRole(member: Member, roleId: string) {
    try {
      await api.patch(`/members/${member.id}/`, { role_id: roleId });
      setNotice(`تم تغيير دور ${member.user.full_name || member.user.username}`);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function linkParty(member: Member, partyId: string) {
    try {
      await api.post(`/members/${member.id}/link-party/`, { party: partyId || null });
      setNotice(
        partyId
          ? "تم الربط — العمليات ستُنسب لنفس الشخص في السجل وفي الحسابات"
          : "أُلغي الربط"
      );
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function resetPassword(member: Member) {
    const password = window.prompt(
      `كلمة مرور جديدة لـ ${member.user.username} (8 أحرف على الأقل)`
    );
    if (!password) return;
    try {
      await api.post(`/members/${member.id}/set-password/`, { password });
      setNotice(`تم تغيير كلمة مرور ${member.user.username}`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggleActive(member: Member) {
    try {
      await api.patch(`/members/${member.id}/`, { is_active: !member.is_active });
      setNotice(member.is_active ? "تم إيقاف الدخول" : "تم تفعيل الدخول");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const linkedPartyIds = new Set(members.map((m) => m.party?.id).filter(Boolean) as string[]);
  const freeParties = parties.filter((p) => !linkedPartyIds.has(p.id));

  return (
    <>
      <PageHeader
        title="المستخدمون والصلاحيات"
        subtitle="لكل شخص حساب دخول خاص به — لأن كل عملية تُسجَّل باسم من نفّذها"
        farm={me?.farm?.name}
      >
        {can("users.create") && (
          <Button
            icon={showForm ? "close" : "plus"}
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "إغلاق النموذج" : "حساب دخول جديد"}
          </Button>
        )}
      </PageHeader>

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      {showForm && (
        <MemberForm
          roles={roles}
          parties={freeParties}
          onDone={(message) => {
            setShowForm(false);
            setNotice(message);
            load();
          }}
          onError={setError}
        />
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>اسم المستخدم</th>
              <th>الدور</th>
              <th>مرتبط بسجل</th>
              <th>الحالة</th>
              <th className="cell-actions" />
            </tr>
          </thead>
          <tbody>
            <TableMessage
              colSpan={6}
              empty={members.length === 0}
              emptyTitle="لا يوجد مستخدمون"
              emptyText="أنشئ حساب دخول لكل شخص يعمل على النظام، ليُنسب ما يسجّله إليه في سجل التدقيق."
            />
            {members.map((member) => {
              const isMe = member.user.id === me?.user.id;
              return (
                <tr key={member.id} style={member.is_active ? undefined : { opacity: 0.55 }}>
                  <td className="strong">
                    <span className="inline" style={{ gap: "var(--s2)" }}>
                      {member.user.full_name || member.user.username}
                      {isMe && <span className="badge">أنت</span>}
                    </span>
                  </td>
                  <td className="muted num">{member.user.username}</td>
                  <td>
                    {can("users.edit") ? (
                      <select
                        className="input"
                        value={member.role.id}
                        onChange={(e) => changeRole(member, e.target.value)}
                      >
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>{role.display_name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="badge">{member.role.display_name}</span>
                    )}
                  </td>
                  <td>
                    {can("users.edit") ? (
                      <select
                        className="input"
                        value={member.party?.id ?? ""}
                        onChange={(e) => linkParty(member, e.target.value)}
                      >
                        <option value="">— غير مرتبط —</option>
                        {member.party && (
                          <option value={member.party.id}>
                            {member.party.name} ({KIND_LABEL[member.party.kind]})
                          </option>
                        )}
                        {freeParties.map((party) => (
                          <option key={party.id} value={party.id}>
                            {party.name} ({KIND_LABEL[party.kind]})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">{member.party?.name ?? "—"}</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${member.is_active ? "badge-success" : "badge-muted"}`}>
                      {member.is_active ? "يستطيع الدخول" : "موقوف"}
                    </span>
                  </td>
                  <td className="cell-actions">
                    {can("users.edit") && (
                      <span className="cell-actions-group">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="key"
                          onClick={() => resetPassword(member)}
                        >
                          كلمة المرور
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={member.is_active ? "lock" : "check"}
                          onClick={() => toggleActive(member)}
                          disabled={isMe}
                          title={isMe ? "لا يمكنك إيقاف حسابك أنت" : ""}
                        >
                          {member.is_active ? "إيقاف" : "تفعيل"}
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="alert alert-info mt-4 no-print">
        <Icon name="info" />
        <span>
          الربط بسجل شخص يجعل الاسم في قائمة العاملين هو نفسه صاحب حساب الدخول: ما يدفعه من جيبه
          يظهر في حسابه، وما يسجّله يظهر باسمه في سجل التدقيق.
        </span>
      </div>
    </>
  );
}

function MemberForm({
  roles,
  parties,
  onDone,
  onError,
}: {
  roles: Role[];
  parties: Party[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    username: "",
    password: "",
    phone: "",
    role_id: "",
    party_id: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm((prev) => ({ ...prev, role_id: prev.role_id || roles[0]?.id || "" }));
  }, [roles]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/members/", { ...form, party_id: form.party_id || null });
      onDone(`أُنشئ حساب «${form.username}» — سلّمه اسم المستخدم وكلمة المرور`);
      setForm({ full_name: "", username: "", password: "", phone: "", role_id: roles[0]?.id ?? "", party_id: "" });
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card mb-4" onSubmit={submit}>
      <div className="card-title">حساب دخول جديد</div>
      <div className="row">
        <div className="field">
          <label>الاسم الكامل</label>
          <input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="مثال: فراس الظاهر"
            required
          />
        </div>
        <div className="field">
          <label>اسم المستخدم (للدخول)</label>
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="firas"
            required
          />
        </div>
        <div className="field">
          <label>كلمة المرور</label>
          <input
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="8 أحرف على الأقل"
            minLength={8}
            required
          />
        </div>
        <div className="field">
          <label>الهاتف</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="field">
          <label>الدور</label>
          <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} required>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{role.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>اربطه بسجل شخص</label>
          <select value={form.party_id} onChange={(e) => setForm({ ...form, party_id: e.target.value })}>
            <option value="">— لاحقًا —</option>
            {parties.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name} ({KIND_LABEL[party.kind]})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <Button icon="check" busy={busy}>
          {busy ? "جارٍ الإنشاء…" : "إنشاء الحساب"}
        </Button>
      </div>
      <span className="stat-hint" style={{ marginInlineStart: 12 }}>
        الدخول باسم المستخدم وكلمة المرور — البريد الإلكتروني اختياري وغير مستخدم للدخول.
      </span>
    </form>
  );
}
