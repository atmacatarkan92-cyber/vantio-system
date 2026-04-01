import React from "react";

function AdminLeadsPage() {
  return (
    <div className="min-h-screen bg-[#07090f] text-[#eef2ff]">
      <h2 className="mb-1 text-[22px] font-bold">Leads</h2>
      <p className="text-[12px] text-[#6b7a9a]">
        Übersicht über potenzielle Verwaltungen und Immobilienpartner.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#7aaeff] bg-[#141824] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Leads gesamt</p>
          <p className="mt-2 text-[24px] font-bold text-[#eef2ff]">0</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#4ade80] bg-[#141824] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Kontakt aufgenommen</p>
          <p className="mt-2 text-[24px] font-bold text-[#4ade80]">0</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#fb923c] bg-[#141824] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">In Verhandlung</p>
          <p className="mt-2 text-[24px] font-bold text-[#fb923c]">0</p>
        </div>

        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.07] border-t-4 border-t-[#a78bfa] bg-[#141824] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Partner geworden</p>
          <p className="mt-2 text-[24px] font-bold text-[#a78bfa]">0</p>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-[14px] border border-white/[0.07] bg-[#141824] p-6">
        <h3 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#6b7a9a]">Lead Übersicht</h3>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/[0.05] bg-[#111520] text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#6b7a9a]">
              <th className="px-3 py-3">Firma</th>
              <th className="px-3 py-3">Kontaktperson</th>
              <th className="px-3 py-3">E-Mail</th>
              <th className="px-3 py-3">Telefon</th>
              <th className="px-3 py-3">Stadt</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-b border-white/[0.05] text-[#eef2ff]">
              <td className="py-3 pr-3">Muster Immobilien AG</td>
              <td className="py-3 pr-3">Max Muster</td>
              <td className="py-3 pr-3 text-[#7aaeff]">info@muster.ch</td>
              <td className="py-3 pr-3">+41 44 111 22 33</td>
              <td className="py-3 pr-3">Zürich</td>
              <td className="py-3">
                <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
                  Lead
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminLeadsPage;
