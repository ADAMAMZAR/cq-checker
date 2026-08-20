"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { HERO_SLIDE_IMAGES } from "@/config/portalFeatures";

export default function HeroBanner() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    // Check if user prefers reduced motion (battery saver or budget devices)
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % HERO_SLIDE_IMAGES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] -mx-4 md:-mx-8 -mt-6 overflow-hidden min-h-[280px] sm:min-h-[340px] flex items-center shadow-xl bg-slate-900 px-6 sm:px-12 md:px-16 py-8 sm:py-12">
      {/* Background Hero Carousel Images */}
      {HERO_SLIDE_IMAGES.map((src, index) => (
        <div
          key={src}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out transform-gpu will-change-transform ${
            index === currentImageIndex ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Image
            src={src}
            alt="Operations Deck Hero Background"
            fill
            priority={index === 0}
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
      ))}

      {/* Hero Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30 z-10 pointer-events-none" />

      {/* Hero Text Content */}
      <div className="relative z-20 w-full flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="max-w-3xl flex flex-col items-start gap-3">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.1] drop-shadow-md">
            Operations Deck <br className="hidden sm:inline" />
            <span className="text-blue-400">Group Procurement Office</span>
          </h1>
          <p className="font-serif text-[13px] sm:text-[15px] md:text-base text-gray-200 leading-relaxed max-w-xl drop-shadow">
            Welcome to the Gamuda Group Procurement Office central portal for everything related to GPO operations.
          </p>
        </div>
      </div>
    </section>
  );
}
