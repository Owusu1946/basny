"use client";

import DirectionalIcon from "@/components/directional-icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import type { HomeContent } from "@basny-web/api/content/home";

export default function HeroSlider({ slides }: { slides: HomeContent["slides"] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slides[activeIndex]!;

  function showSlide(direction: -1 | 1) {
    setActiveIndex((index) => (index + direction + slides.length) % slides.length);
  }

  return (
    <section
      className="hero-section page-shell"
      aria-label="Featured collections"
      aria-roledescription="carousel"
    >
      <div className="hero-frame">
        <div className="hero-visual" key={activeIndex}>
          <Image
            src={activeSlide.image}
            alt={activeSlide.alt}
            fill
            priority={activeIndex === 0}
            sizes="(max-width: 760px) 100vw, 92vw"
            className="hero-image"
          />
          <div className="hero-wash" aria-hidden="true" />
        </div>

        <div className="hero-copy" aria-live="polite" aria-atomic="true">
          <p className="eyebrow hero-eyebrow">{activeSlide.eyebrow}</p>
          <h1>{activeSlide.title}</h1>
          <p className="hero-description">{activeSlide.description}</p>
          <div className="hero-links">
            <Link className="button-primary" href={activeSlide.primaryHref as Route}>
              {activeSlide.primaryLabel}
              <DirectionalIcon />
            </Link>
            <Link className="button-secondary" href={activeSlide.secondaryHref as Route}>
              {activeSlide.secondaryLabel}
            </Link>
          </div>
        </div>

        <div className="hero-controls">
          <span className="hero-slide-count">
            <span>0{activeIndex + 1}</span><span className="slide-count-divider">/</span>0{slides.length}
          </span>
          <div className="hero-arrows">
            <button className="hero-arrow" type="button" onClick={() => showSlide(-1)} aria-label="Previous slide">
              <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" />
            </button>
            <button className="hero-arrow" type="button" onClick={() => showSlide(1)} aria-label="Next slide">
              <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" />
            </button>
          </div>
          <div className="hero-dots" role="group" aria-label="Choose a slide">
            {slides.map((slide, index) => (
              <button
                className={`hero-dot ${index === activeIndex ? "hero-dot--active" : ""}`}
                key={index}
                type="button"
                aria-label={`Show slide ${index + 1}: ${slide.title}`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
