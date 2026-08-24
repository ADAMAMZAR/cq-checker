"use client";

import { useState } from "react";
import {
  IconMail,
  IconPhone,
  IconMapPin,
  IconChevronRight,
  IconChevronDown,
} from "@tabler/icons-react";

interface OfficeContact {
  office: string;
  address: string;
  phone: string;
  email: string;
}

interface RegionContact {
  region: string;
  offices: OfficeContact[];
}

const REGIONS: RegionContact[] = [
  {
    region: "Malaysia (HQ)",
    offices: [
      {
        office: "Gamuda Group Procurement Office",
        address: "Menara Gamuda, D-16-01, Block D, PJ Trade Centre, No. 8, Jalan PJU 8/8A, Bandar Damansara Perdana, 47820 Petaling Jaya, Selangor, Malaysia",
        phone: "1300 820 030",
        email: "group-procurement@gamuda.com.my",
      },
    ],
  },
  {
    region: "Taiwan",
    offices: [
      {
        office: "Gamuda Berhad Taiwan",
        address: "16F-2, No. 90 Changjiang St., Cianjhen District, Kaohsiung City, 806 Taiwan",
        phone: "+886 7 332 9828",
        email: "group-procurement@gamuda.com.tw",
      },
    ],
  },
  {
    region: "Australia",
    offices: [
      {
        office: "Gamuda Australia Office",
        address: "Level 23, 100 Mount Street, North Sydney NSW 2060, Australia",
        phone: "+61 2 9170 9200",
        email: "group.procurement@gamuda.com.au",
      },
    ],
  },
  {
    region: "Vietnam",
    offices: [
      {
        office: "Gamuda Land Ho Chi Minh City (Head Office)",
        address: "15th Floor, The Mett Tower, An Khanh Ward, Ho Chi Minh City, Vietnam",
        phone: "+84 28 6252 9999",
        email: "glhcmc.procurement@gamudaland.com.my",
      },
      {
        office: "Gamuda Land Hanoi Office",
        address: "Gamuda City, KM 1.5 Phap Van, Yen So Park, Yen So Ward, Hoang Mai District, Hanoi, Vietnam",
        phone: "+84 24 3944 5699",
        email: "glhn.procurement@gamudaland.com.my",
      },
    ],
  },
  {
    region: "Singapore",
    offices: [
      {
        office: "Gamuda Singapore",
        address: "78 Shenton Wy, #19-01, Singapore 079120",
        phone: "+65 6909 1983",
        email: "group-procurement@gamuda.com.my",
      },
    ],
  },
];

export default function Footer() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggle = (key: string) => {
    setOpenKey((cur) => (cur === key ? null : key));
  };

  return (
    <footer className="relative w-full mt-auto overflow-hidden bg-[var(--bg-card-solid)]">
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/footer/footer.jpg')" }}
      />

      <div className="relative z-10 w-full px-4 md:px-8 py-8 sm:py-10">
        {/* Section Heading */}
        <div className="mb-6 flex items-center gap-3">
          <h2 className="font-sans text-sm sm:text-base font-bold tracking-tight text-[var(--heading-color)]">
            Global Office Contacts
          </h2>
        </div>
        {/* Regional Contacts Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch">
          {REGIONS.map((r) => (
            <div
              key={r.region}
              className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 h-full transition-all duration-300 hover:border-[var(--accent-primary-border-hover)] hover:shadow-lg"
            >
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
                  <IconMapPin className="w-4 h-4" />
                </div>
                <h3 className="font-sans text-sm font-bold text-[var(--heading-color)]">
                  {r.region}
                </h3>
              </div>
              <div
                className={`flex-1 flex flex-col ${r.offices.length === 1 ? "justify-between" : ""
                  }`}
              >
                {r.offices.map((o, idx) => {
                  const isMulti = r.offices.length > 1;
                  const key = `${r.region}::${idx}`;
                  const isOpen = isMulti ? openKey === key : true;

                  return (
                    <div
                      key={o.office}
                      className={`flex flex-col rounded-lg border border-transparent transition-all duration-300 ${isOpen ? "bg-[var(--bg-surface)] border-[var(--accent-primary-border)] p-3 mb-3" : ""
                        }`}
                    >
                      {isMulti ? (
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          aria-expanded={isOpen}
                          className="flex items-center gap-2 text-left w-full group"
                        >
                          <IconChevronDown
                            className={`w-3.5 h-3.5 shrink-0 text-[var(--accent-primary-text)] transition-transform duration-300 ${isOpen ? "-rotate-90" : ""
                              }`}
                          />
                          <span className="font-semibold text-[var(--heading-color)] group-hover:text-[var(--accent-primary-text)] transition-colors text-[12px]">
                            {o.office}
                          </span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <IconChevronRight className="w-3.5 h-3.5 shrink-0 text-[var(--accent-primary-text)]" />
                          <span className="font-semibold text-[var(--heading-color)] text-[12px]">
                            {o.office}
                          </span>
                        </div>
                      )}
                      <div
                        className={`grid transition-all duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr] opacity-100 mt-1" : "grid-rows-[0fr] opacity-0"
                          }`}
                      >
                        <div className="overflow-hidden flex flex-col gap-2 pl-5">
                          <div className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)] leading-relaxed">
                            <IconMapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{o.address}</span>
                          </div>

                          <a
                            href={`tel:${o.phone.replace(/[^+\d]/g, "")}`}
                            className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] hover:text-[var(--accent-primary-text)] transition-colors"
                          >
                            <IconPhone className="w-3.5 h-3.5 shrink-0" />
                            <span>{o.phone}</span>
                          </a>

                          <a
                            href={`mailto:${o.email}`}
                            className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] hover:text-[var(--accent-primary-text)] transition-colors"
                          >
                            <IconMail className="w-3.5 h-3.5 shrink-0" />
                            <span className="break-all">{o.email}</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
