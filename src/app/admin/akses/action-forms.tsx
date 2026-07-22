"use client";

import { useActionState } from "react";
import {
  KeyRound,
  LoaderCircle,
  LogOut,
  ShieldMinus,
  UserRoundCog,
  UserX,
} from "lucide-react";
import {
  changeUserStatus,
  disableFallback,
  enableFallback,
  grantAssignment,
  revokeAssignment,
  revokeSession,
  type ActionState,
} from "./actions";

const initialState: ActionState = undefined;

type RoleOption = {
  key: string;
  name: string;
  description: string;
};

function ActionFeedback({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p className={`action-feedback ${state.ok ? "feedback-success" : "feedback-danger"}`} role="status" aria-live="polite">
      {state.message}
    </p>
  );
}

function PendingButton({ pending, children, danger = false }: { pending: boolean; children: React.ReactNode; danger?: boolean }) {
  return (
    <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="icon-spin" aria-hidden="true" size={18} /> : null}
      {pending ? "Memproses…" : children}
    </button>
  );
}

export function StatusForm({ targetUserId, expectedVersion, currentStatus }: { targetUserId: string; expectedVersion: number; currentStatus: string }) {
  const [state, action, pending] = useActionState(changeUserStatus, initialState);
  return (
    <form action={action} className="action-form">
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <div className="field-group">
        <label htmlFor={`status-${targetUserId}`}>Status baru</label>
        <select className="input" id={`status-${targetUserId}`} name="status" defaultValue={currentStatus}>
          <option value="INVITED">Diundang</option>
          <option value="ACTIVE">Aktif</option>
          <option value="SUSPENDED">Ditangguhkan</option>
          <option value="DEACTIVATED">Dinonaktifkan</option>
        </select>
      </div>
      <ReasonField id={`status-reason-${targetUserId}`} />
      <ActionFeedback state={state} />
      <PendingButton pending={pending}><UserRoundCog aria-hidden="true" size={18} /> Perbarui status</PendingButton>
    </form>
  );
}

export function GrantAssignmentForm({ targetUserId, roles }: { targetUserId: string; roles: RoleOption[] }) {
  const [state, action, pending] = useActionState(grantAssignment, initialState);
  return (
    <form action={action} className="action-form form-grid">
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <div className="field-group">
        <label htmlFor={`role-${targetUserId}`}>Role yang dapat diberikan</label>
        <select className="input" id={`role-${targetUserId}`} name="roleKey" required defaultValue="">
          <option value="" disabled>Pilih role</option>
          {roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
        </select>
      </div>
      <div className="field-group">
        <label htmlFor={`active-until-${targetUserId}`}>Berakhir pada <span className="optional">(opsional)</span></label>
        <input className="input" id={`active-until-${targetUserId}`} name="activeUntil" type="datetime-local" />
      </div>
      <div className="form-grid-full"><ReasonField id={`grant-reason-${targetUserId}`} /></div>
      <div className="form-grid-full"><ActionFeedback state={state} /></div>
      <div className="form-grid-full"><PendingButton pending={pending}><UserRoundCog aria-hidden="true" size={18} /> Berikan penugasan</PendingButton></div>
    </form>
  );
}

export function RevokeAssignmentForm({ assignmentId, expectedVersion, roleName }: { assignmentId: string; expectedVersion: number; roleName: string }) {
  const [state, action, pending] = useActionState(revokeAssignment, initialState);
  return (
    <details className="inline-disclosure">
      <summary><ShieldMinus aria-hidden="true" size={17} /> Cabut</summary>
      <form action={action} className="action-form compact-action-form">
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <input type="hidden" name="expectedVersion" value={expectedVersion} />
        <p className="impact-copy">Akses dari role <strong>{roleName}</strong> akan berhenti segera.</p>
        <ReasonField id={`revoke-assignment-${assignmentId}`} />
        <ActionFeedback state={state} />
        <PendingButton pending={pending} danger><ShieldMinus aria-hidden="true" size={18} /> Cabut penugasan</PendingButton>
      </form>
    </details>
  );
}

export function RevokeSessionForm({ sessionId, expectedVersion, isCurrent }: { sessionId: string; expectedVersion: number; isCurrent: boolean }) {
  const [state, action, pending] = useActionState(revokeSession, initialState);
  return (
    <details className="inline-disclosure">
      <summary><LogOut aria-hidden="true" size={17} /> Cabut sesi</summary>
      <form action={action} className="action-form compact-action-form">
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="expectedVersion" value={expectedVersion} />
        <p className="impact-copy">{isCurrent ? "Sesi yang sedang digunakan akan berakhir." : "Perangkat ini harus masuk kembali."}</p>
        <ReasonField id={`revoke-session-${sessionId}`} />
        <ActionFeedback state={state} />
        <PendingButton pending={pending} danger><LogOut aria-hidden="true" size={18} /> Konfirmasi pencabutan</PendingButton>
      </form>
    </details>
  );
}

export function EnableFallbackForm({ targetUserId, expectedVersion }: { targetUserId: string; expectedVersion: number }) {
  const [state, action, pending] = useActionState(enableFallback, initialState);
  return (
    <form action={action} className="action-form">
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <div className="field-group">
        <label htmlFor={`fallback-password-${targetUserId}`}>Kata sandi sementara baru</label>
        <input className="input" id={`fallback-password-${targetUserId}`} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} aria-describedby={`fallback-help-${targetUserId}`} required />
        <p className="field-help" id={`fallback-help-${targetUserId}`}>Minimum 12 karakter, dengan huruf besar, huruf kecil, angka, dan simbol.</p>
      </div>
      <ReasonField id={`fallback-enable-reason-${targetUserId}`} />
      <ActionFeedback state={state} />
      <PendingButton pending={pending}><KeyRound aria-hidden="true" size={18} /> {expectedVersion > 0 ? "Atur ulang & aktifkan" : "Aktifkan fallback"}</PendingButton>
    </form>
  );
}

export function DisableFallbackForm({ targetUserId, expectedVersion }: { targetUserId: string; expectedVersion: number }) {
  const [state, action, pending] = useActionState(disableFallback, initialState);
  return (
    <details className="inline-disclosure">
      <summary><UserX aria-hidden="true" size={17} /> Nonaktifkan fallback</summary>
      <form action={action} className="action-form compact-action-form">
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <input type="hidden" name="expectedVersion" value={expectedVersion} />
        <p className="impact-copy">Pengguna tidak dapat masuk dengan kata sandi fallback setelah aksi ini.</p>
        <ReasonField id={`fallback-disable-reason-${targetUserId}`} />
        <ActionFeedback state={state} />
        <PendingButton pending={pending} danger><UserX aria-hidden="true" size={18} /> Nonaktifkan fallback</PendingButton>
      </form>
    </details>
  );
}

function ReasonField({ id }: { id: string }) {
  return (
    <div className="field-group">
      <label htmlFor={id}>Alasan perubahan</label>
      <textarea className="input textarea" id={id} name="reason" minLength={12} maxLength={500} rows={3} required />
      <p className="field-help">Minimum 12 karakter. Alasan disimpan pada jejak audit.</p>
    </div>
  );
}
