import Link from "next/link";
import { ArrowRight, CalendarDays, Check, MessageCircle, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";

export default function Home() {
  return <main className="landing">
    <header className="landing-nav"><Brand/><nav aria-label="Main navigation"><a href="#how">How it works</a><a href="#safety">Safety</a><Link className="button button-small button-dark" href="/sign-in">Student sign in <ArrowRight size={15}/></Link></nav></header>
    <section className="hero">
      <div className="eyebrow"><Sparkles size={14}/> Made for your campus, not the whole internet</div>
      <h1>Campus life,<br/><em>all in one place.</em></h1>
      <p className="hero-copy">Buy what you need. Sell what you don’t. Find your people—and what’s happening next. Only verified students get inside.</p>
      <div className="hero-actions"><Link className="button button-primary" href="/sign-in">Join with school email <ArrowRight size={18}/></Link><a className="text-link" href="#how">See how it works</a></div>
      <div className="trust-row"><span><ShieldCheck size={17}/> School email verified</span><span><Check size={17}/> No platform fees</span><span><Check size={17}/> Private campus community</span></div>
      <div className="hero-cards" aria-label="Campus Exchange preview">
        <article className="float-card listing-preview"><span className="mini-label">Fresh listing</span><div className="preview-object desk" aria-hidden="true"><i/><b/></div><strong>Solid oak study desk</strong><span>$65 · 8 min ago</span></article>
        <article className="float-card event-preview"><CalendarDays size={24}/><span>FRI · 7:00 PM</span><strong>Sunset volleyball pickup</strong><small>17 students going</small></article>
        <article className="float-card message-preview"><span className="avatar coral">M</span><div><small>Maya replied</small><strong>“Yes! I can meet by the library.”</strong></div><MessageCircle size={17}/></article>
      </div>
    </section>
    <section id="how" className="how-section"><div><span className="section-kicker">One student account</span><h2>Everything your campus group chat is trying to be.</h2></div><div className="feature-grid">
      <article><span className="feature-icon peach"><ShoppingBag/></span><h3>Marketplace</h3><p>Useful things, fair prices, and real students close enough to meet safely.</p><Link href="/sign-in">Browse listings <ArrowRight size={15}/></Link></article>
      <article><span className="feature-icon lilac"><CalendarDays/></span><h3>Events</h3><p>Discover club meetings, pickup games, workshops, and small campus moments.</p><Link href="/sign-in">See what’s on <ArrowRight size={15}/></Link></article>
      <article><span className="feature-icon mint"><MessageCircle/></span><h3>Student-to-student</h3><p>Private conversations connected to listings, without exposing your phone number.</p><Link href="/sign-in">Meet the community <ArrowRight size={15}/></Link></article>
    </div></section>
    <section id="safety" className="safety-band"><div><ShieldCheck size={40}/><span className="section-kicker">Safety by design</span><h2>A campus community should feel like one.</h2><p>Every account starts with a verified school email. Blocking, reporting, private messages, and human moderation are built into the foundation.</p></div></section>
    <footer><Brand/><p>Built for students who want campus life to feel a little smaller.</p><span>© 2026 Campus Exchange</span></footer>
  </main>;
}
