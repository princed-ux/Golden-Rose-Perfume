
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { CustomerAuthForm } from "@/src/components/customer-auth-form";
import { AuthNotice } from "../auth-notice";

import "../page.css";
import "./scent.css";

export const metadata: Metadata = {
  title: "Welcome Back | Golden Rose Perfume",
  description: "A beautiful fragrance journey awaits.",
};

const particles = [
  { left: "35%", top: "65%", delay: "0s" },
  { left: "47%", top: "42%", delay: "-2s" },
  { left: "60%", top: "75%", delay: "-4s" },
  { left: "73%", top: "29%", delay: "-6s" },
  { left: "87%", top: "55%", delay: "-3s" },
  { left: "25%", top: "33%", delay: "-5s" },
];

export default function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  return (
    <main className="gr-auth gr-login relative isolate min-h-svh overflow-hidden">
      {/* BRAND HEADER */}
      <header className="absolute inset-x-0 top-0 z-30 flex h-24 items-center justify-between border-b border-[#d8b575]/20 px-5 sm:px-10 lg:px-16">
        <Link
          href="/"
          className="flex items-center gap-3 text-[#e8c68b] no-underline!"
          aria-label="Golden Rose homepage"
        >
          <Image
            src="/assets/brand/golden-rose-logo.png"
            alt=""
            width={54}
            height={60}
            unoptimized
            className="h-12 w-auto object-contain"
          />

          <span className="flex flex-col gap-1 font-serif text-base tracking-[0.12em] sm:text-xl">
            GOLDEN ROSE
            <small className="font-sans text-[7px] font-semibold tracking-[0.3em] text-[#c9ab78]">
              BEAUTY OF FRAGRANCE
            </small>
          </span>
        </Link>

        <Link
          href="/"
          className="text-[11px] text-[#e0c797] transition hover:text-white"
        >
          ← Back to boutique
        </Link>
      </header>

      <div className="relative grid min-h-svh grid-cols-1 lg:grid-cols-[56%_44%]">
        {/* FRAGRANCE CAMPAIGN */}
        <section className="relative min-h-[410px] overflow-hidden bg-[#090706] lg:min-h-svh">
          <Image
            src="/assets/hero/hero-01.png"
            alt="An elegant red perfume bottle beside a rose"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 56vw"
            className="gr-login__photo object-cover object-[75%_center]"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/40" />

          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-black/45 to-transparent" />

          <div className="absolute bottom-12 left-6 z-10 max-w-[600px] sm:left-12 lg:bottom-28 lg:left-20">
            <p className="mb-5 text-[10px] font-bold tracking-[0.3em] text-[#e3be7c]">
              THE ART OF FRAGRANCE
            </p>

            <h2 className="font-serif text-[clamp(43px,5.5vw,88px)] leading-[1.04] tracking-[-0.05em] text-[#fff8eb]">
              Every scent
              <br />
              <em className="font-normal text-[#e8c489]">
                tells a story.
              </em>
            </h2>

            <p className="mt-6 hidden max-w-sm text-sm leading-8 text-[#e2d5be] sm:block">
              Some moments fade.
              <br />
              Beautiful fragrances stay.
            </p>

            <div className="mt-8 h-px w-24 bg-gradient-to-r from-[#e8c489] to-transparent" />
          </div>

          <span className="absolute bottom-5 left-6 z-10 text-[8px] tracking-[0.2em] text-[#cdb181] sm:left-12">
            GOLDEN ROSE · SIGNATURE COLLECTION
          </span>
        </section>

        {/* MOVING GOLDEN PERFUME SCENT */}
        <div
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
          aria-hidden="true"
        >
          <svg
            className="gr-login__scent absolute inset-0 h-full w-full"
            viewBox="0 0 1440 900"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="rose-scent-gradient"
                x1="0%"
                y1="100%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor="#c08b48" stopOpacity="0" />
                <stop offset="40%" stopColor="#f1d59c" stopOpacity=".7" />
                <stop offset="70%" stopColor="#fff4dc" stopOpacity=".95" />
                <stop offset="100%" stopColor="#d5a45b" stopOpacity="0" />
              </linearGradient>
            </defs>

            <g className="gr-login__mist">
              <path
                pathLength="100"
                d="M500 820 C350 610 770 640 650 420 S840 100 1170 90"
              />
              <path
                pathLength="100"
                d="M650 850 C840 670 410 500 740 330 S1120 390 1370 130"
              />
              <path
                pathLength="100"
                d="M420 790 C610 610 280 440 550 260 S790 120 680 -40"
              />
            </g>

            <g className="gr-login__trails">
              <path
                pathLength="100"
                d="M500 820 C350 610 770 640 650 420 S840 100 1170 90"
              />
              <path
                pathLength="100"
                d="M650 850 C840 670 410 500 740 330 S1120 390 1370 130"
              />
              <path
                pathLength="100"
                d="M420 790 C610 610 280 440 550 260 S790 120 680 -40"
              />
            </g>
          </svg>

          {particles.map((particle, index) => (
            <span
              key={index}
              className="gr-login__particle"
              style={{
                left: particle.left,
                top: particle.top,
                animationDelay: particle.delay,
              }}
            />
          ))}
        </div>

        {/* CUSTOMER LOGIN */}
        <section
          className="relative z-20 flex min-h-[650px] items-center justify-center bg-[var(--auth-bg)] px-6 py-20 sm:px-10 lg:min-h-svh lg:px-14 lg:pt-32"
          aria-labelledby="login-title"
        >
          <div className="w-full max-w-[450px]">
            <div className="mb-10 flex items-center gap-4 text-[#d8b575]">
              <span className="text-2xl">✦</span>
              <span className="h-px w-8 bg-[#d8b575]" />
              <span className="text-[9px] font-bold tracking-[0.2em]">
                YOUR PRIVATE BOUTIQUE
              </span>
            </div>

            <p className="mb-4 text-[10px] font-bold tracking-[0.2em] text-[var(--auth-gold)]">
              A LITTLE LUXURY, JUST FOR YOU
            </p>

            <h1
              id="login-title"
              className="gr-login__headline mb-6 font-serif text-[var(--auth-text)]"
            >
              Welcome
              <br />
              <em className="font-normal text-[var(--auth-gold)]">
                back.
              </em>
            </h1>

            <p className="mb-9 max-w-sm text-sm leading-7 text-[var(--auth-muted)]">
              Your favourite scents are waiting.
              Sign in and continue your fragrance journey.
            </p>

            <div className="w-full">
              <Suspense><AuthNotice searchParams={searchParams} /></Suspense>
              <CustomerAuthForm mode="login" />
            </div>

            <nav
              className="mt-7 flex flex-col gap-5 text-xs"
              aria-label="Customer authentication"
            >
              <Link
                href="/account/forgot-password"
                className="text-[var(--auth-gold)]"
              >
                Forgot your password?
              </Link>

              <p className="text-[var(--auth-muted)]">
                New to Golden Rose?{" "}
                <Link
                  href="/account/register"
                  className="font-semibold text-[var(--auth-gold)]"
                >
                  Create an account
                </Link>
              </p>
            </nav>

            <div className="mt-14 flex items-center justify-center gap-5 border-t border-[var(--auth-border)] pt-7 text-[9px] tracking-[0.16em] text-[var(--auth-muted)]">
              <span>✧</span>
              <span>BEAUTY OF FRAGRANCE</span>
              <span>✧</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
