import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUpRight, Check, Copy, Crosshair, ExternalLink, Github, Menu, Microscope, MoveDown, Send, X, Zap } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

// Owner-editable constants. Safe placeholders keep every link functional before launch.
const TOKEN_ADDRESS = 'MICRO_PEPE_CONTRACT_TBA';
const BUY_URL = 'https://example.com/micro-pepe-buy';
const COMMUNITY_URL = 'https://example.com/micro-pepe-community';

function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setRevealed(true);
        observer.disconnect();
      }
    }, { threshold: 0.13 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, className: `reveal${revealed ? ' revealed' : ''}` };
}

function ScrollLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  const go = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
    window.history.replaceState(null, '', href);
  }, [href]);
  return <a href={href} className={className} onClick={go} data-testid={`link-${href.slice(1)}`}>{children}</a>;
}

function Home() {
  const [scopeOpen, setScopeOpen] = useState(false);
  const [pepeSize, setPepeSize] = useState(420);
  const [found, setFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }, []);
  const copyContract = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(TOKEN_ADDRESS);
      setCopied(true);
      showToast('Contract address copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Address ready to copy');
    }
  }, [showToast]);
  const heroReveal = useReveal();
  const visualReveal = useReveal();
  const statsReveal = useReveal();
  const labReveal = useReveal();
  const roadmapReveal = useReveal();
  const findReveal = useReveal();
  const communityReveal = useReveal();

  return (
    <main className="site-shell">
      <header className="site-header">
        <div className="container-wide nav-inner">
          <ScrollLink href="#top" className="wordmark">
            <span className="wordmark-mark">µ</span>
            <span>MICRO PEPE</span>
          </ScrollLink>
          <nav className="nav-links" aria-label="Main navigation">
            <ScrollLink href="#about">about</ScrollLink>
            <ScrollLink href="#roadmap">roadmap</ScrollLink>
            <ScrollLink href="#find">find pepe</ScrollLink>
            <ScrollLink href="#community">community</ScrollLink>
          </nav>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a className="nav-buy" href={BUY_URL} target="_blank" rel="noreferrer" data-testid="link-buy-header">buy $µPEPE <ArrowUpRight size={13} /></a>
            <button className="button-outline mobile-menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation" data-testid="button-toggle-navigation" style={{ display: 'none', minHeight: 38, padding: '0 10px' }}>
              {mobileNav ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
        {mobileNav && <nav className="mobile-nav" aria-label="Mobile navigation">
          <ScrollLink href="#about">about</ScrollLink>
          <ScrollLink href="#roadmap">roadmap</ScrollLink>
          <ScrollLink href="#find">find pepe</ScrollLink>
          <ScrollLink href="#community">community</ScrollLink>
        </nav>}
      </header>

      <section className="hero" id="top">
        <div className="container-wide hero-grid">
          <div ref={heroReveal.ref} className={heroReveal.className}>
            <div className="eyebrow"><span>an extremely small internet asset</span></div>
            <h1 className="hero-title">THE<br />SMALLEST<br /><em>FROG</em><br />ONLINE.</h1>
            <p className="hero-copy">A coin for people who believe bigger is not always better. No utility. No roadmap to the moon. Just a frog with very little going on.</p>
            <div className="hero-actions">
              <ScrollLink href="#about" className="button-solid">inspect the frog <ArrowDown size={14} /></ScrollLink>
              <a href={COMMUNITY_URL} target="_blank" rel="noreferrer" className="button-outline" data-testid="link-join-community">join the small club <Send size={14} /></a>
            </div>
            <p className="micro-note">↓ best viewed with one eye closed</p>
          </div>
          <div ref={visualReveal.ref} className={`${visualReveal.className} delay-1 hero-visual`}>
            <div className="visual-stamp">VERIFIED<br />TINY<br />SPECIMEN</div>
            <div className="specimen-frame">
              <img className={`specimen-img ${pepeSize > 420 ? 'is-growing' : ''}`} style={{ width: `${pepeSize}px`, height: `${pepeSize}px`, maxWidth: 'none', maxHeight: 'none', position: 'absolute', inset: '50%', transform: `translate(-50%, -50%)` }} src="/assets/micro-pepe.jpeg" alt="A tiny green Pepe frog standing alone in a white field" data-testid="img-hero-pepe" />
              <div className="measurement">approx. 11.2mm <Crosshair size={12} /></div>
              <div className="specimen-label">SPECIMEN: PEPE / SIZE: TINY</div>
            </div>
            <div className="hero-side-note">nothing to see here / please look closer</div>
          </div>
        </div>
        <div className="scroll-cue"><MoveDown size={13} /> scroll responsibly</div>
      </section>

      <div className="ticker" aria-label="Micro Pepe announcement">
        <div className="ticker-track">
          <span>small coin <b>•</b> smaller frog</span><span>small coin <b>•</b> smaller frog</span><span>small coin <b>•</b> smaller frog</span><span>small coin <b>•</b> smaller frog</span>
          <span>small coin <b>•</b> smaller frog</span><span>small coin <b>•</b> smaller frog</span>
        </div>
      </div>

      <section className="section" id="about">
        <div className="container-wide">
          <div className="intro-layout">
            <div className="intro-aside reveal revealed">
              <p>Micro Pepe is a field study in minimalism, internet folklore, and what happens when a frog is placed next to a coin and told to be smaller.</p>
            </div>
            <div>
              <div className="section-kicker">01 / micro data</div>
              <h2 className="section-heading">Small coin.<br /><em>Smaller frog.</em></h2>
            </div>
          </div>
          <div ref={statsReveal.ref} className={`stat-grid ${statsReveal.className}`}>
            <div className="stat"><span className="stat-value">0.001</span><span className="stat-label">frog energy</span></div>
            <div className="stat"><span className="stat-value">1px</span><span className="stat-label">growth per click</span></div>
            <div className="stat"><span className="stat-value">24</span><span className="stat-label">community members*</span></div>
            <div className="stat"><span className="stat-value">∞</span><span className="stat-label">tiny potential</span></div>
          </div>
          <p className="micro-note">* number may be emotionally rather than mathematically accurate</p>
        </div>
      </section>

      <section className="section lab-section" id="lab">
        <div className="container-wide lab-layout">
          <div ref={labReveal.ref} className={labReveal.className}>
            <div className="section-kicker">02 / the lab</div>
            <h2 className="section-heading">Please do not<br /><em>enlarge.</em></h2>
            <div className="lab-copy"><p>Pepe has asked to remain small. We respect his wishes. But if you absolutely must, this button will add one whole pixel to his existence.</p></div>
          </div>
          <div className="lab-card reveal revealed delay-1">
            <img className="lab-card-img" src="/assets/micro-pepe.jpeg" alt="Micro Pepe under observation" style={{ objectPosition: 'center' }} data-testid="img-lab-pepe" />
            <div className="lab-card-foot"><span>current size: <b>{pepeSize - 420 + 11.2}mm</b></span><span>status: <b>content</b></span></div>
            <button className="button-outline lab-button" onClick={() => { setPepeSize((size) => Math.min(size + 1, 460)); showToast('Pepe is now 1px bigger'); }} data-testid="button-grow-pepe">
              <Zap size={14} /> make the frog 1px bigger
            </button>
          </div>
        </div>
      </section>

      <section className="section" id="roadmap">
        <div className="container-wide roadmap-layout">
          <div ref={roadmapReveal.ref} className={`roadmap-intro ${roadmapReveal.className}`}>
            <div className="section-kicker">03 / a tiny roadmap</div>
            <h2 className="section-heading">Very little.<br /><em>Very soon.</em></h2>
            <p>Our roadmap is deliberately short because this frog has places to be and very short legs with which to get there.</p>
          </div>
          <div className="roadmap-list reveal revealed delay-1">
            <div className="roadmap-item current"><span className="roadmap-num">001</span><div><h3>Be extremely small</h3><p>Launch the coin. Establish the premise.</p></div><span className="roadmap-status">now</span></div>
            <div className="roadmap-item"><span className="roadmap-num">002</span><div><h3>Hide Pepe somewhere</h3><p>It will be obvious once you find him.</p></div><span className="roadmap-status">soon</span></div>
            <div className="roadmap-item"><span className="roadmap-num">003</span><div><h3>Become slightly larger</h3><p>Define “larger” with extreme caution.</p></div><span className="roadmap-status">maybe</span></div>
            <div className="roadmap-item"><span className="roadmap-num">004</span><div><h3>Take over the very small world</h3><p>A modest ambition for a modest frog.</p></div><span className="roadmap-status">eventually</span></div>
          </div>
        </div>
      </section>

      <section className="section find-section" id="find">
        <div className="container-wide">
          <div className="find-layout">
            <div ref={findReveal.ref} className={findReveal.className}>
              <div className="section-kicker">04 / field test</div>
              <h2 className="section-heading">Find<br /><em>Pepe.</em></h2>
              <p className="find-copy">He is in this box. We are not saying where. Click him when you see him. Your eyes will adjust in 3–5 business seconds.</p>
              <button className="button-outline" onClick={() => setFound(false)} data-testid="button-reset-find"><Crosshair size={14} /> reset the field</button>
            </div>
            <div className="find-board reveal revealed delay-1" aria-label="A hidden Pepe mini-game">
              <span className="find-grid-line horizontal" style={{ top: '33%' }} /><span className="find-grid-line horizontal" style={{ top: '66%' }} />
              <span className="find-grid-line vertical" style={{ left: '33%' }} /><span className="find-grid-line vertical" style={{ left: '66%' }} />
              <button className="hidden-pepe" style={{ left: '68%', top: '56%' }} onClick={() => { setFound(true); showToast('Pepe found. Obviously.'); }} aria-label="Hidden Pepe" data-testid="button-hidden-pepe">
                <img src="/assets/micro-pepe.jpeg" alt="" />
              </button>
              <div className={`find-success ${found ? 'visible' : ''}`}><div><Check size={30} /><h3>you found him</h3><p>the smallest possible victory</p></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section community-section" id="community">
        <div className="container-wide">
          <div ref={communityReveal.ref} className={`community-head ${communityReveal.className}`}>
            <div><div className="section-kicker">05 / final small thoughts</div><h2 className="section-heading">Come for the<br /><em>tiny frog.</em></h2></div>
            <p>Stay for the unreasonably committed community, the microscopic lore, and the possibility of a frog that is marginally larger than before.</p>
          </div>
          <div className="community-grid reveal revealed delay-1">
            <div className="cta-panel">
              <h3>Buy a little.<br />Believe a little.</h3>
              <p>Not financial advice. Barely advice at all. Just a link to the smallest coin on the internet.</p>
              <a className="button-solid" href={BUY_URL} target="_blank" rel="noreferrer" data-testid="link-buy-final">buy $µPEPE <ArrowUpRight size={15} /></a>
            </div>
            <div className="links-panel">
              <h3>the small club is open</h3>
              <div className="social-list">
                <a className="social-link" href={COMMUNITY_URL} target="_blank" rel="noreferrer" data-testid="link-community-final">community <Send size={17} /></a>
                <a className="social-link" href={COMMUNITY_URL} target="_blank" rel="noreferrer" data-testid="link-x">x / formerly known as twitter <ExternalLink size={16} /></a>
                <a className="social-link" href={COMMUNITY_URL} target="_blank" rel="noreferrer" data-testid="link-github">lore archive <Github size={17} /></a>
              </div>
            </div>
          </div>
          <div className="contract-block">
            <div className="contract-copy"><b>contract address</b><br />{TOKEN_ADDRESS}</div>
            <button className="copy-button" onClick={copyContract} data-testid="button-copy-contract">{copied ? <><Check size={13} /> copied</> : <><Copy size={13} /> copy address</>}</button>
          </div>
        </div>
      </section>

      <footer className="site-footer container-wide">
        <span>MICRO PEPE / EST. SOMEWHERE ONLINE</span>
        <span>small coin. smaller frog. no promises.</span>
      </footer>

      <div className={`microscope-overlay ${scopeOpen ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Microscope view of Pepe" onClick={(event) => { if (event.target === event.currentTarget) setScopeOpen(false); }}>
        <div className="scope-window">
          <div className="scope-top"><span><Microscope size={14} /> microscope mode / magnification: unreasonable</span><button className="scope-close" onClick={() => setScopeOpen(false)} aria-label="Close microscope" data-testid="button-close-microscope"><X size={18} /></button></div>
          <div className="scope-image"><img src="/assets/micro-pepe.jpeg" alt="Enlarged view of the tiny Pepe frog" /><div className="scope-crosshair" /></div>
          <div className="scope-bottom"><span>specimen is still very small</span><span>focus: excellent-ish</span></div>
        </div>
      </div>
      <button className="floating-scope" onClick={() => setScopeOpen(true)} aria-label="Open microscope mode" data-testid="button-open-microscope"><Microscope size={17} /> <span>microscope</span></button>
      <div className={`toast-message ${toast ? 'show' : ''}`} role="status" data-testid="status-toast">{toast}</div>
    </main>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;