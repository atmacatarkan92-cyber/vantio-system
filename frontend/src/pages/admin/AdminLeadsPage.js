import React from "react";

function leadStatusBadgeClass(label) {
  const s = String(label || "").trim();
  if (s === "Kontakt aufgenommen") {
    return "border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] text-[#5b9cf6]";
  }
  if (s === "Partner") {
    return "border border-[rgba(157,124,244,0.2)] bg-[rgba(157,124,244,0.1)] text-[#9d7cf4]";
  }
  if (s === "In Verhandlung" || s === "Lead") {
    return "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]";
  }
  return "border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]";
}

function AdminLeadsPage() {
  const demoCompany = "Muster Immobilien AG";
  const demoContact = "Max Muster";
  const demoEmail = "info@muster.ch";
  const demoPhone = "+41 44 111 22 33";
  const demoCity = "Zürich";
  const demoStatus = "Lead";
  const nameParts = demoCompany.trim().split(/\s+/).filter(Boolean);
  const companyInitials =
    nameParts.length >= 2
      ? `${nameParts[0][0] || ""}${nameParts[nameParts.length - 1][0] || ""}`.toUpperCase() || "?"
      : demoCompany.slice(0, 2).toUpperCase() || "?";

  return (
    <div className="-m-6 min-h-screen bg-[#080a0f]">
      <div className="sticky top-0 z-30 flex h-[50px] items-center justify-between border-b border-[#1c2035] bg-[#0c0e15] px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[#edf0f7]">
            Van<span className="text-[#5b9cf6]">tio</span>
          </span>
          <span className="text-[#4a5070]">·</span>
          <span className="text-[14px] font-medium text-[#edf0f7]">Leads</span>
        </div>
        <button
          type="button"
          className="cursor-pointer rounded-[6px] border border-[rgba(91,156,246,0.28)] bg-[rgba(91,156,246,0.1)] px-[14px] py-[5px] text-[11px] font-medium text-[#5b9cf6]"
        >
          + Neuer Lead
        </button>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        <div>
          <div className="mb-[10px] flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#4a5070]">Übersicht</span>
            <div className="h-px flex-1 bg-[#1c2035]" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[15px] py-[13px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#5b9cf6]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Leads gesamt</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#5b9cf6]">0</p>
              <p className="text-[10px] text-[#4a5070]">Alle erfassten Leads</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[15px] py-[13px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#3ddc84]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">
                Kontakt aufgenommen
              </p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#3ddc84]">0</p>
              <p className="text-[10px] text-[#4a5070]">Kontakt hergestellt</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[15px] py-[13px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#f5a623]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">In Verhandlung</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#f5a623]">0</p>
              <p className="text-[10px] text-[#4a5070]">Aktive Verhandlung</p>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-[#1c2035] bg-[#10121a] px-[15px] py-[13px] transition-colors hover:border-[#242840]">
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[10px] bg-[#9d7cf4]" />
              <p className="mb-[4px] text-[9px] font-medium uppercase tracking-[0.5px] text-[#4a5070]">Partner geworden</p>
              <p className="mb-[4px] font-mono text-[22px] font-medium leading-none text-[#9d7cf4]">0</p>
              <p className="text-[10px] text-[#4a5070]">Erfolgreich konvertiert</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[#1c2035] bg-[#10121a]">
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-2 border-b border-[#1c2035] px-[18px] py-[13px]">
            <h3 className="text-[13px] font-medium text-[#edf0f7]">Lead Übersicht</h3>
            <div className="ml-auto flex flex-wrap items-center gap-[8px]">
              <input
                type="search"
                placeholder="Firma, Name, Stadt…"
                defaultValue=""
                className="box-border w-[220px] max-w-full rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#edf0f7] outline-none placeholder:text-[#4a5070]"
              />
              <select
                defaultValue="all"
                aria-label="Status"
                className="box-border cursor-pointer appearance-none rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[5px] font-['DM_Sans'] text-[12px] text-[#8892b0]"
              >
                <option value="all">Alle Status</option>
                <option value="lead">Lead</option>
                <option value="contact">Kontakt aufgenommen</option>
                <option value="negotiation">In Verhandlung</option>
                <option value="partner">Partner</option>
              </select>
              <span className="rounded-[6px] border border-[#1c2035] bg-[#141720] px-[10px] py-[3px] text-[10px] text-[#4a5070]">
                1 Eintrag
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Firma
                  </th>
                  <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Kontaktperson
                  </th>
                  <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    E-Mail
                  </th>
                  <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Telefon
                  </th>
                  <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Stadt
                  </th>
                  <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Status
                  </th>
                  <th className="whitespace-nowrap border-b border-[#1c2035] px-[18px] py-[8px] text-left text-[9px] font-medium uppercase tracking-[0.6px] text-[#4a5070]">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="cursor-pointer transition-colors hover:bg-[#141720]">
                  <td className="border-b-0 px-[18px] py-[13px] align-middle text-[11px] text-[#8892b0]">
                    <div className="flex items-center gap-[9px]">
                      <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[8px] border border-[rgba(91,156,246,0.2)] bg-[rgba(91,156,246,0.1)] text-[10px] font-semibold text-[#5b9cf6]">
                        {companyInitials}
                      </div>
                      <span className="text-[12px] font-medium text-[#edf0f7]">{demoCompany}</span>
                    </div>
                  </td>
                  <td className="border-b-0 px-[18px] py-[13px] align-middle text-[11px] text-[#8892b0]">
                    {demoContact}
                  </td>
                  <td className="border-b-0 px-[18px] py-[13px] align-middle text-[11px] text-[#5b9cf6]">{demoEmail}</td>
                  <td className="border-b-0 px-[18px] py-[13px] align-middle font-mono text-[10px] text-[#4a5070]">
                    {demoPhone}
                  </td>
                  <td className="border-b-0 px-[18px] py-[13px] align-middle text-[11px] text-[#8892b0]">{demoCity}</td>
                  <td className="border-b-0 px-[18px] py-[13px] align-middle text-[11px] text-[#8892b0]">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ${leadStatusBadgeClass(demoStatus)}`}
                    >
                      {demoStatus}
                    </span>
                  </td>
                  <td className="border-b-0 px-[18px] py-[13px] align-middle text-[11px] text-[#8892b0]">
                    <button
                      type="button"
                      className="cursor-pointer rounded-[6px] border border-[#252a3a] bg-[#141720] px-[12px] py-[4px] text-[11px] text-[#8892b0] transition-all duration-150 hover:border-[#3b5fcf] hover:bg-[#1a1e2c] hover:text-[#edf0f7]"
                    >
                      Öffnen →
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminLeadsPage;
