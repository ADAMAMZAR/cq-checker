"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { HERO_SLIDE_IMAGES } from "@/config/portalFeatures";

export default function HeroBanner() {
  // Lazy state initialization ensures initial render is ALREADY a random image (0ms flash)
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(() => {
    return Math.floor(Math.random() * HERO_SLIDE_IMAGES.length);
  });

  useEffect(() => {
    // Check if user prefers reduced motion (battery saver or budget devices)
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = setInterval(() => {
      setCurrentImageIndex((prev) => {
        let nextIndex = Math.floor(Math.random() * HERO_SLIDE_IMAGES.length);
        while (nextIndex === prev && HERO_SLIDE_IMAGES.length > 1) {
          nextIndex = Math.floor(Math.random() * HERO_SLIDE_IMAGES.length);
        }
        return nextIndex;
      });
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] -mx-4 md:-mx-8 -mt-6 overflow-hidden min-h-[280px] sm:min-h-[340px] flex items-center shadow-xl bg-slate-900 px-6 sm:px-12 md:px-16 py-8 sm:py-12">
      {/* Background Hero Carousel Images */}
      {HERO_SLIDE_IMAGES.map((src, index) => (
        <div
          key={src}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out transform-gpu will-change-transform ${index === currentImageIndex ? "opacity-100" : "opacity-0 pointer-events-none"
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
            <span className="relative inline-block mt-3 px-4 sm:px-6 py-1.5 sm:py-2">
              {/* Organic White Paint Brush Stroke Background */}
              <svg
                className="absolute inset-0 w-full h-full text-white drop-shadow-lg scale-y-110 scale-x-105"
                viewBox="0 0 360 60"
                preserveAspectRatio="none"
                fill="currentColor"
              >
                <path d="M 6,20 C 35,8 90,16 160,8 C 230,0 295,14 354,16 C 359,30 352,48 344,52 C 285,58 205,48 140,54 C 75,60 28,52 6,45 C 1,35 2,26 6,20 Z" />
              </svg>

              {/* Red Corporate Text on Brush Stroke */}
              <span className="relative z-10 text-[#c8102e] font-extrabold tracking-tight">
                Group Procurement Office
              </span>
            </span>

          </h1>
          <p className="font-serif text-[13px] sm:text-[15px] md:text-base text-gray-200 leading-relaxed max-w-xl drop-shadow">
            Welcome to the Gamuda Group Procurement Office central portal for everything related to GPO operations.
          </p>
        </div>
      </div>
    </section>
  );
}
