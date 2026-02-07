import Link from "next/link";
import { AnimatedCustomers } from "@/components/AnimatedCustomers";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-zk-bg text-zk-text">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-zk-bg/70 border-b border-white/[0.06] h-16 flex items-center px-6">
        <div className="max-w-[1080px] mx-auto w-full flex items-center justify-between">
          <Link href="/" className="font-display font-bold text-lg text-zk-text flex items-center gap-2 no-underline">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="coinGradNav" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00FFB2"/>
                  <stop offset="100%" stopColor="#00D395"/>
                </linearGradient>
              </defs>
              <circle cx="24" cy="24" r="20" fill="url(#coinGradNav)"/>
              <circle cx="24" cy="24" r="10" fill="#0A0F0D"/>
              <path d="M4 14 L44 14 L44 30 L4 30 Z" fill="#003D29"/>
              <rect x="10" y="19" width="28" height="6" rx="1" fill="#00FFB2" opacity="0.9"/>
              <circle cx="17" cy="22" r="2" fill="#003D29"/>
              <circle cx="24" cy="22" r="2" fill="#003D29"/>
              <circle cx="31" cy="22" r="2" fill="#003D29"/>
            </svg>
            Private Payroll
          </Link>
          <div className="flex items-center gap-6">
            <Link href="#how-it-works" className="text-zk-muted hover:text-zk-text text-sm font-medium transition-colors hidden sm:block">
              How It Works
            </Link>
            <Link href="#features" className="text-zk-muted hover:text-zk-text text-sm font-medium transition-colors hidden sm:block">
              Features
            </Link>
            <Link href="#stack" className="text-zk-muted hover:text-zk-text text-sm font-medium transition-colors hidden sm:block">
              Stack
            </Link>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-zk-accent text-zk-bg hover:bg-zk-accent-hover transition-all hover:-translate-y-px"
            >
              Launch App &rarr;
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-[calc(64px+10rem)] pb-16 text-center relative overflow-hidden">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_center,_rgba(52,211,153,0.12)_0%,_transparent_70%)] pointer-events-none" />
        <div className="relative z-10 max-w-[1080px] mx-auto px-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zk-accent/20 bg-zk-accent/5 text-zk-accent text-xs font-display font-semibold uppercase tracking-wider mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-zk-accent animate-pulse" />
            Powered by SNARKs &middot; Live on Plasma
          </div>
          <h1 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.08] tracking-tight mb-5">
            Zero fees.<br/><span className="text-zk-accent">Zero exposure.</span>
          </h1>
          <p className="text-zk-muted text-[clamp(1rem,1.4vw,1.25rem)] max-w-[52ch] mx-auto mb-6 leading-relaxed">
            Confidential stablecoin payroll with zero-fee USDT0 transfers.
            ZK proofs verify the sum — individual amounts never touch the chain.
          </p>
          <AnimatedCustomers />
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-7 py-3 text-[0.9375rem] font-semibold rounded-xl bg-zk-accent text-zk-bg hover:bg-zk-accent-hover transition-all hover:-translate-y-px hover:shadow-[0_0_24px_rgba(52,211,153,0.25)]"
            >
              Launch App &rarr;
            </Link>
            <a
              href="https://github.com/0xunderfo/private-payroll"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3 text-[0.9375rem] font-medium rounded-xl bg-transparent text-zk-text border border-white/10 hover:bg-white/[0.04] hover:border-white/15 transition-all hover:-translate-y-px"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-12 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="max-w-[1080px] mx-auto px-6">
          <p className="font-display text-xs text-zk-accent uppercase tracking-wider font-semibold mb-3">How It Works</p>
          <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.75rem)] font-bold tracking-tight leading-tight mb-8">
            Prove without revealing.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { num: "01", title: "Upload payroll", desc: "Enter recipients and amounts via CSV or the form. Data never leaves your browser." },
              { num: "02", title: "Generate proof", desc: "Groth16 proof generated client-side via snarkjs. Proves amounts sum to the declared total." },
              { num: "03", title: "Deposit & commit", desc: "USDT deposited to escrow. Poseidon hash commitments lock each recipient's payment amount." },
              { num: "04", title: "Recipients claim", desc: "Each recipient claims with their secret salt. The contract verifies the commitment and releases funds." },
            ].map((step, i) => (
              <div key={i} className="bg-zk-surface border border-white/[0.06] rounded-xl p-5 hover:border-zk-accent/15 hover:shadow-[0_0_30px_rgba(52,211,153,0.04)] transition-all">
                <div className="font-display text-xs font-bold text-zk-accent mb-3 flex items-center gap-2">
                  <span className="w-5 h-px bg-zk-accent/50" />
                  {step.num}
                </div>
                <h3 className="font-display text-[clamp(1rem,1.4vw,1.25rem)] font-semibold tracking-tight mb-2">{step.title}</h3>
                <p className="text-zk-muted text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-12 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="max-w-[1080px] mx-auto px-6">
          <p className="font-display text-xs text-zk-accent uppercase tracking-wider font-semibold mb-3">Why Private Payroll</p>
          <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.75rem)] font-bold tracking-tight leading-tight mb-8">
            Your on-chain payroll<br/>is leaking data today
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Transaction Mock */}
            <div className="bg-zk-surface border border-white/[0.06] rounded-xl p-6">
              <p className="font-display text-sm font-semibold mb-2">What anyone can see on a block explorer</p>
              <p className="text-zk-muted text-sm leading-relaxed mb-5">
                Individual salaries are replaced with Poseidon commitments.
                The total is publicly verifiable — the breakdown is not.
              </p>
              <div className="bg-zk-inset border border-white/[0.06] rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                  <span className="font-display text-xs text-zk-dim uppercase tracking-wider">Payroll #1 &middot; 3 recipients</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zk-accent/10 text-zk-accent text-xs font-display font-semibold">
                    ✓ ZK Verified
                  </span>
                </div>
                {["alice.eth", "bob.eth", "carol.eth"].map((name, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <span className="text-zk-muted text-sm font-medium">{name}</span>
                    <span className="text-zk-dim text-sm font-display flex items-center gap-2">
                      <span className="text-xs">🔒</span>
                      •••••• USDT
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3 bg-zk-accent/5 border-t border-zk-accent/10">
                  <span className="text-zk-muted text-sm font-medium">Verified total</span>
                  <span className="text-zk-accent text-sm font-display font-semibold tabular-nums">15,000.00 USDT</span>
                </div>
              </div>
            </div>

            {/* Benefits Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Privacy", color: "text-zk-accent", title: "Salaries stay secret", desc: "Individual amounts are private inputs to the ZK circuit. Only the total hits the chain." },
                { label: "Cost", color: "text-blue-400", title: "Zero gas fees", desc: "Plasma provides free USDT transfers. Running payroll shouldn't eat into your treasury." },
                { label: "UX", color: "text-amber-400", title: "CSV in, payroll out", desc: "Drop a spreadsheet with addresses and amounts. One click generates the proof." },
                { label: "Distribution", color: "text-rose-400", title: "Recipients self-serve", desc: "Funds sit in escrow until claimed with a unique link. No coordination overhead." },
              ].map((item, i) => (
                <div key={i} className="bg-zk-surface border border-white/[0.06] rounded-xl p-5 hover:border-white/10 hover:-translate-y-0.5 transition-all">
                  <div className={`font-display text-xs font-semibold uppercase tracking-wider mb-3 ${item.color}`}>{item.label}</div>
                  <h3 className="font-display text-[clamp(1rem,1.4vw,1.25rem)] font-semibold tracking-tight mb-2">{item.title}</h3>
                  <p className="text-zk-muted text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section id="stack" className="py-12 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="max-w-[1080px] mx-auto px-6">
          <p className="font-display text-xs text-zk-accent uppercase tracking-wider font-semibold mb-3">Stack</p>
          <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.75rem)] font-bold tracking-tight leading-tight mb-8">
            Built with conviction
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: "Chain", value: "Plasma" },
              { label: "Circuits", value: "Circom + Groth16" },
              { label: "Contracts", value: "Solidity + Foundry" },
              { label: "Frontend", value: "Next.js + wagmi" },
              { label: "Hash", value: "Poseidon T4" },
            ].map((item, i) => (
              <div key={i} className="text-center p-5 bg-zk-surface border border-white/[0.06] rounded-xl hover:border-white/10 hover:-translate-y-0.5 transition-all">
                <div className="font-display text-xs text-zk-dim uppercase tracking-wider font-medium mb-2">{item.label}</div>
                <div className="font-display text-sm font-semibold text-zk-text">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 text-center relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute bottom-[-100px] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,_rgba(52,211,153,0.12)_0%,_transparent_70%)] pointer-events-none" />
        <div className="relative z-10 max-w-[1080px] mx-auto px-6">
          <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.75rem)] font-bold tracking-tight mb-4">
            Trustless payroll.<br/>Full privacy.
          </h2>
          <p className="text-zk-muted text-[clamp(1rem,1.4vw,1.25rem)] max-w-[48ch] mx-auto mb-8 leading-relaxed">
            Zero-fee stablecoin payments on Plasma.
            Start running private payroll in minutes.
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-7 py-3 text-[0.9375rem] font-semibold rounded-xl bg-zk-accent text-zk-bg hover:bg-zk-accent-hover transition-all hover:-translate-y-px hover:shadow-[0_0_24px_rgba(52,211,153,0.25)]"
          >
            Launch App &rarr;
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] px-6 py-8">
        <div className="max-w-[1080px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <div className="text-zk-dim">
            <span className="text-zk-muted font-semibold">Private Payroll</span> &middot; ETH Oxford 2026
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zk-surface border border-white/[0.06] text-xs font-medium text-zk-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              ETH Oxford '26
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zk-surface border border-white/[0.06] text-xs font-medium text-zk-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-zk-accent" />
              Live on Plasma
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zk-surface border border-white/[0.06] text-xs font-medium text-zk-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Groth16 zkSNARKs
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}
