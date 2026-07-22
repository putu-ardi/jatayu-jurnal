import { capabilities } from "./policy";

export const SYSTEM_ROLES = [
  {
    key: "admin-akses",
    name: "Admin Akses",
    description: "Mengelola identitas, penugasan berscope, sesi, fallback, dan audit akses.",
    riskLevel: "CRITICAL" as const,
    permissions: Object.values(capabilities),
  },
  {
    key: "admin-data",
    name: "Admin Data",
    description: "Mengelola master akademik tanpa hak mengelola akses.",
    riskLevel: "HIGH" as const,
    permissions: ["academic.periods.read", "academic.periods.manage"],
  },
  {
    key: "admin-branding",
    name: "Admin Branding",
    description: "Mengelola draft dan publikasi identitas aplikasi.",
    riskLevel: "HIGH" as const,
    permissions: ["branding.read", "branding.draft.manage", "branding.publish"],
  },
  {
    key: "admin-ti",
    name: "Admin TI",
    description: "Membaca status operasional tanpa akses otomatis ke data akademik atau IAM.",
    riskLevel: "MEDIUM" as const,
    permissions: ["operations.read"],
  },
  {
    key: "guru",
    name: "Guru",
    description: "Peran pengajar; capability jurnal ditambahkan pada increment domain jurnal.",
    riskLevel: "LOW" as const,
    permissions: [],
  },
] as const;

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [capabilities.usersRead]: "Membaca daftar dan detail pengguna dalam scope.",
  [capabilities.userStatusManage]: "Mengubah lifecycle pengguna dalam scope.",
  [capabilities.assignmentsGrant]: "Memberi penugasan sesuai grant boundary.",
  [capabilities.assignmentsRevoke]: "Mencabut penugasan sesuai grant boundary.",
  [capabilities.fallbackManage]: "Mengaktifkan atau menonaktifkan fallback per akun.",
  [capabilities.sessionsRevoke]: "Mencabut sesi pengguna dalam scope.",
  [capabilities.auditRead]: "Membaca audit akses yang sudah diredaksi.",
  "academic.periods.read": "Membaca periode akademik.",
  "academic.periods.manage": "Mengelola lifecycle periode akademik.",
  "branding.read": "Membaca branding live dan draft sesuai capability.",
  "branding.draft.manage": "Mengubah draft branding.",
  "branding.publish": "Mempublikasikan revision branding tervalidasi.",
  "operations.read": "Membaca status operasional teragregasi.",
};
