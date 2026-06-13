const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");

// Icons
const { FaRobot, FaUserTie, FaChartLine, FaExchangeAlt, FaLightbulb, FaQuestion, FaBriefcase, FaBalanceScale } = require("react-icons/fa");
const { MdWork, MdTrendingUp, MdPeople } = require("react-icons/md");

async function iconPng(IconComp, color = "#FFFFFF", size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(IconComp, { color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

const NAVY   = "0D1B3E";
const TEAL   = "0E9AA7";
const GOLD   = "F4A623";
const WHITE  = "FFFFFF";
const LGRAY  = "F0F4F8";
const MGRAY  = "6B7C93";
const RED    = "E84545";
const GREEN  = "2ECC71";

const makeShadow = () => ({ type: "outer", color: "000000", blur: 8, offset: 3, angle: 45, opacity: 0.15 });

async function build() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = "AI, Automation and the Changing Nature of Work";

  // ─── SLIDE 1: TITLE ───────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: NAVY };

    // Big teal left block
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.18, h: 5.625, fill: { color: TEAL }, line: { color: TEAL } });

    // Eyebrow
    s.addText("SPJIMR | PGPM 2026 | Future of Work After AI", {
      x: 0.4, y: 0.4, w: 9.2, h: 0.3,
      fontSize: 10, color: TEAL, fontFace: "Calibri", charSpacing: 2, margin: 0
    });

    // Title
    s.addText("AI, Automation &\nthe Changing\nNature of Work", {
      x: 0.4, y: 0.75, w: 6.5, h: 3.2,
      fontSize: 48, bold: true, color: WHITE, fontFace: "Cambria", valign: "top", margin: 0
    });

    // Module tag
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.4, y: 4.1, w: 1.9, h: 0.42,
      fill: { color: GOLD }, line: { color: GOLD }, rectRadius: 0.06
    });
    s.addText("MODULE 1 | SESSIONS 1–2", {
      x: 0.4, y: 4.1, w: 1.9, h: 0.42,
      fontSize: 9, bold: true, color: NAVY, fontFace: "Calibri", align: "center", valign: "middle", margin: 0
    });

    // Subtitle line
    s.addText("What is changing in how work gets done?", {
      x: 0.4, y: 4.65, w: 6.2, h: 0.4,
      fontSize: 15, color: "AABBCC", fontFace: "Calibri", italic: true, margin: 0
    });

    // Right side — big stat
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 7.1, y: 1.0, w: 2.6, h: 3.2,
      fill: { color: "122040" }, line: { color: TEAL, width: 1 }, rectRadius: 0.12,
      shadow: makeShadow()
    });
    s.addText("85M", {
      x: 7.1, y: 1.25, w: 2.6, h: 1.1,
      fontSize: 54, bold: true, color: GOLD, fontFace: "Cambria", align: "center", margin: 0
    });
    s.addText("jobs displaced\nby 2025", {
      x: 7.1, y: 2.3, w: 2.6, h: 0.6,
      fontSize: 13, color: WHITE, fontFace: "Calibri", align: "center", margin: 0
    });
    s.addText("97M", {
      x: 7.1, y: 3.0, w: 2.6, h: 0.8,
      fontSize: 40, bold: true, color: TEAL, fontFace: "Cambria", align: "center", margin: 0
    });
    s.addText("new roles\nemerging", {
      x: 7.1, y: 3.75, w: 2.6, h: 0.5,
      fontSize: 11, color: "AABBCC", fontFace: "Calibri", align: "center", margin: 0
    });

    s.addText("WEF Future of Jobs Report 2020", {
      x: 0.4, y: 5.3, w: 9.2, h: 0.2,
      fontSize: 9, color: "556677", fontFace: "Calibri", align: "right", margin: 0
    });

    s.addNotes("Welcome slide. Open with: 'Before we talk theory — these two numbers tell you the whole story. 85 million roles disrupted, 97 million new ones created. The question isn't whether AI changes work. It already has. The question is: which side of that equation are you on?'");
  }

  // ─── SLIDE 2: THE OPENING PROVOCATION ─────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: LGRAY };

    s.addText("Two companies. Same decade. Opposite bets.", {
      x: 0.5, y: 0.3, w: 9, h: 0.6,
      fontSize: 26, bold: true, color: NAVY, fontFace: "Cambria", margin: 0
    });

    // Company A card
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.4, y: 1.05, w: 4.2, h: 3.5,
      fill: { color: WHITE }, line: { color: "DDDDDD", width: 0.5 },
      rectRadius: 0.12, shadow: makeShadow()
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.4, y: 1.05, w: 4.2, h: 0.65,
      fill: { color: RED }, line: { color: RED }, rectRadius: 0.0
    });
    s.addText("COMPANY A", {
      x: 0.4, y: 1.05, w: 4.2, h: 0.65,
      fontSize: 14, bold: true, color: WHITE, fontFace: "Calibri",
      align: "center", valign: "middle", margin: 0
    });
    s.addText([
      { text: "Traded its workers for automation.\n", options: { bold: true, breakLine: false } },
      { text: "\n45,000 robots deployed.\n150,000 warehouse jobs restructured.\nNew roles created for robot technicians, AI auditors, and fleet managers.\n\nHeadcount still grew — but the nature of every job changed overnight.", options: {} }
    ], {
      x: 0.6, y: 1.85, w: 3.8, h: 2.5,
      fontSize: 12, color: "333333", fontFace: "Calibri", valign: "top", margin: 0
    });

    // Company B card
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 5.4, y: 1.05, w: 4.2, h: 3.5,
      fill: { color: WHITE }, line: { color: "DDDDDD", width: 0.5 },
      rectRadius: 0.12, shadow: makeShadow()
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 5.4, y: 1.05, w: 4.2, h: 0.65,
      fill: { color: GREEN }, line: { color: GREEN }
    });
    s.addText("COMPANY B", {
      x: 5.4, y: 1.05, w: 4.2, h: 0.65,
      fontSize: 14, bold: true, color: WHITE, fontFace: "Calibri",
      align: "center", valign: "middle", margin: 0
    });
    s.addText([
      { text: "Chose its workers over technology.\n", options: { bold: true, breakLine: false } },
      { text: "\nDelayed automation at unionized plants.\nInvested $1B in reskilling programs.\nRetained institutional knowledge.\n\nLost 12% market share in 4 years.\nEventually automated anyway — under worse conditions.", options: {} }
    ], {
      x: 5.6, y: 1.85, w: 3.8, h: 2.5,
      fontSize: 12, color: "333333", fontFace: "Calibri", valign: "top", margin: 0
    });

    // Question at bottom
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.4, y: 4.75, w: 9.2, h: 0.65,
      fill: { color: NAVY }, line: { color: NAVY }, rectRadius: 0.08
    });
    s.addText("Which company made the right call? — Hold that thought.", {
      x: 0.4, y: 4.75, w: 9.2, h: 0.65,
      fontSize: 14, bold: true, color: GOLD, fontFace: "Calibri",
      align: "center", valign: "middle", margin: 0
    });

    s.addNotes("Company A = Amazon (Kiva robots). Company B = a composite of legacy auto/retail companies that delayed. Don't reveal yet. Let the class debate. Ask: 'What additional information would you need before deciding?' Good priming for Job-Resource Demand Theory.");
  }

  // ─── SLIDE 3: DISCUSSION PROMPT 1 ─────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: NAVY };

    const iconData = await iconPng(FaQuestion, "#F4A623", 256);
    s.addImage({ data: iconData, x: 4.6, y: 0.3, w: 0.7, h: 0.7 });

    s.addText("DISCUSSION", {
      x: 0.5, y: 0.3, w: 4, h: 0.45,
      fontSize: 11, bold: true, color: TEAL, fontFace: "Calibri", charSpacing: 3, margin: 0
    });

    s.addText("Think about a job someone you know does today.", {
      x: 0.5, y: 0.95, w: 9, h: 0.6,
      fontSize: 22, bold: true, color: WHITE, fontFace: "Cambria", margin: 0
    });

    s.addText("Which parts of that job do you think AI will handle in 5 years?\nWhich parts will still need a human — and why?", {
      x: 0.5, y: 1.65, w: 9, h: 0.9,
      fontSize: 16, color: "AABBCC", fontFace: "Calibri", margin: 0
    });

    // 3 prompt cards
    const cards = [
      { label: "TASK", q: "What does the person actually do, step by step?" },
      { label: "JUDGMENT", q: "Where does experience or intuition matter?" },
      { label: "RELATIONSHIP", q: "Is human contact part of the value itself?" }
    ];
    cards.forEach((c, i) => {
      const x = 0.4 + i * 3.1;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 2.85, w: 2.85, h: 2.1,
        fill: { color: "122040" }, line: { color: TEAL, width: 1 }, rectRadius: 0.1, shadow: makeShadow()
      });
      s.addText(c.label, {
        x: x + 0.1, y: 2.95, w: 2.65, h: 0.35,
        fontSize: 11, bold: true, color: TEAL, fontFace: "Calibri", charSpacing: 2, align: "center", margin: 0
      });
      s.addText(c.q, {
        x: x + 0.12, y: 3.4, w: 2.62, h: 1.4,
        fontSize: 12, color: WHITE, fontFace: "Calibri", align: "center", valign: "middle", margin: 0
      });
    });

    s.addText("3–4 min pair discussion → open share", {
      x: 0.5, y: 5.2, w: 9, h: 0.3,
      fontSize: 10, color: "556677", fontFace: "Calibri", italic: true, align: "center", margin: 0
    });

    s.addNotes("First discussion prompt. Give 3-4 minutes in pairs. When sharing back, listen for the distinction students draw between physical tasks vs cognitive judgment vs emotional labor — that maps directly onto the automation vs augmentation vs creation framework coming next.");
  }

  // ─── SLIDE 4: JOB-RESOURCE DEMAND THEORY ──────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };

    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 10, h: 1.15,
      fill: { color: NAVY }, line: { color: NAVY }
    });
    s.addText("The Framework: Job-Resource Demand Theory", {
      x: 0.5, y: 0, w: 9, h: 1.15,
      fontSize: 22, bold: true, color: WHITE, fontFace: "Cambria", valign: "middle", margin: 0
    });

    s.addText("AI doesn't replace jobs. It redistributes demands.", {
      x: 0.5, y: 1.3, w: 9, h: 0.45,
      fontSize: 16, italic: true, color: MGRAY, fontFace: "Calibri", margin: 0
    });

    // 3 columns
    const cols = [
      { title: "DEMANDS", sub: "What work requires", color: RED,
        items: ["Cognitive load", "Emotional labour", "Physical effort", "Decision complexity"] },
      { title: "RESOURCES", sub: "What work provides", color: TEAL,
        items: ["Autonomy & control", "Skill utilisation", "Social support", "Performance feedback"] },
      { title: "AI EFFECT", sub: "What shifts", color: GOLD,
        items: ["Cognitive: redistributed", "Physical: automated", "Relational: amplified", "New demands: data literacy"] }
    ];

    cols.forEach((c, i) => {
      const x = 0.4 + i * 3.1;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.9, w: 2.9, h: 3.2,
        fill: { color: LGRAY }, line: { color: "DDDDDD", width: 0.5 }, rectRadius: 0.1
      });
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.9, w: 2.9, h: 0.7,
        fill: { color: c.color }, line: { color: c.color }, rectRadius: 0.1
      });
      s.addText(c.title, {
        x, y: 1.9, w: 2.9, h: 0.38,
        fontSize: 13, bold: true, color: WHITE, fontFace: "Calibri", align: "center", valign: "middle", margin: 0
      });
      s.addText(c.sub, {
        x, y: 2.28, w: 2.9, h: 0.3,
        fontSize: 10, color: WHITE, fontFace: "Calibri", align: "center", italic: true, margin: 0
      });
      c.items.forEach((item, j) => {
        s.addText("— " + item, {
          x: x + 0.2, y: 2.75 + j * 0.5, w: 2.55, h: 0.42,
          fontSize: 12, color: "333333", fontFace: "Calibri", valign: "middle", margin: 0
        });
      });
    });

    // Reading cite
    s.addText("Based on: PwC 'Workforce of the Future 2030' + HBR 'How Work Has Changed' (Fernandez, 2025)", {
      x: 0.4, y: 5.25, w: 9.2, h: 0.25,
      fontSize: 9, color: MGRAY, fontFace: "Calibri", italic: true, align: "right", margin: 0
    });

    s.addNotes("Core theory slide. Key point: AI doesn't just remove tasks — it restructures what's demanded from workers and what they get back. The 'AI Effect' column is where the conversation gets interesting. Draw attention to 'new demands: data literacy' — this is the skill gap PwC's 2030 report flags most urgently.");
  }

  // ─── SLIDE 5: BEFORE vs AFTER ─────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: LGRAY };

    s.addText("The Transformation: Before and After AI", {
      x: 0.4, y: 0.2, w: 9.2, h: 0.6,
      fontSize: 24, bold: true, color: NAVY, fontFace: "Cambria", margin: 0
    });
    s.addText("Across three dimensions that matter most", {
      x: 0.4, y: 0.78, w: 9.2, h: 0.3,
      fontSize: 12, color: MGRAY, fontFace: "Calibri", italic: true, margin: 0
    });

    const rows = [
      { dim: "HOW WORK IS DONE", before: "Sequential tasks executed by individuals. Handoffs manual. Knowledge siloed in experience.", after: "AI handles routine steps. Humans manage exceptions, orchestrate, and oversee outputs." },
      { dim: "WHO DOES THE WORK", before: "Defined roles with fixed job descriptions. Career paths were linear and predictable.", after: "Fluid teams, hybrid roles. Gig workers, contractors, and AI systems work in parallel." },
      { dim: "WHERE VALUE COMES FROM", before: "Execution and expertise. Knowing how to do something was the asset.", after: "Judgment and creativity. Knowing which problem to solve — and why — is the new asset." },
    ];

    rows.forEach((r, i) => {
      const y = 1.2 + i * 1.38;
      // Dimension label
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.4, y, w: 1.65, h: 1.1,
        fill: { color: NAVY }, line: { color: NAVY }, rectRadius: 0.08
      });
      s.addText(r.dim, {
        x: 0.4, y, w: 1.65, h: 1.1,
        fontSize: 10, bold: true, color: WHITE, fontFace: "Calibri",
        align: "center", valign: "middle", margin: 8
      });
      // Before
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 2.2, y, w: 3.5, h: 1.1,
        fill: { color: WHITE }, line: { color: "FFCDD2", width: 1 }, rectRadius: 0.08
      });
      s.addText([
        { text: "BEFORE  ", options: { bold: true, color: RED, fontSize: 9 } },
        { text: r.before, options: { color: "333333", fontSize: 11 } }
      ], { x: 2.35, y: y + 0.05, w: 3.2, h: 1.0, fontFace: "Calibri", valign: "middle", margin: 0 });

      // After
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 5.9, y, w: 3.7, h: 1.1,
        fill: { color: WHITE }, line: { color: "C8E6C9", width: 1 }, rectRadius: 0.08
      });
      s.addText([
        { text: "AFTER  ", options: { bold: true, color: GREEN, fontSize: 9 } },
        { text: r.after, options: { color: "333333", fontSize: 11 } }
      ], { x: 6.05, y: y + 0.05, w: 3.45, h: 1.0, fontFace: "Calibri", valign: "middle", margin: 0 });
    });

    s.addText("HBR 'How Work Has Changed' (Fernandez, 2025) | PwC '9 Trends Shaping Work in 2026' (Aytens et al.)", {
      x: 0.4, y: 5.28, w: 9.2, h: 0.22,
      fontSize: 9, color: MGRAY, fontFace: "Calibri", italic: true, align: "right", margin: 0
    });

    s.addNotes("Walk row by row. Pause on the third row — 'where value comes from' — this is the one MBAs should feel personally. Their competitive advantage in management is shifting from knowing-how to knowing-why. Peter Aytens' 2026 trends report calls this the 'judgment premium.'");
  }

  // ─── SLIDE 6: DISCUSSION PROMPT 2 ─────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: TEAL };

    s.addText("DISCUSSION", {
      x: 0.5, y: 0.35, w: 9, h: 0.35,
      fontSize: 11, bold: true, color: NAVY, fontFace: "Calibri", charSpacing: 3, margin: 0
    });
    s.addText("Amazon automated.\nBut it also hired 1.5 million people.", {
      x: 0.5, y: 0.8, w: 9, h: 1.2,
      fontSize: 28, bold: true, color: WHITE, fontFace: "Cambria", margin: 0
    });
    s.addText("So was it automation — or was it augmentation?", {
      x: 0.5, y: 2.0, w: 9, h: 0.55,
      fontSize: 18, italic: true, color: NAVY, fontFace: "Calibri", margin: 0
    });

    // Two options to pick
    const opts = [
      { label: "AUTOMATION", desc: "Technology replaces human tasks. Net labour demand falls.", c: RED },
      { label: "AUGMENTATION", desc: "Technology enhances human capability. Humans do more, better.", c: GOLD },
    ];
    opts.forEach((o, i) => {
      const x = 0.4 + i * 4.9;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 2.75, w: 4.4, h: 2.35,
        fill: { color: WHITE }, line: { color: "DDDDDD" }, rectRadius: 0.1, shadow: makeShadow()
      });
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 2.75, w: 4.4, h: 0.55,
        fill: { color: o.c }, line: { color: o.c }, rectRadius: 0.1
      });
      s.addText(o.label, {
        x, y: 2.75, w: 4.4, h: 0.55,
        fontSize: 14, bold: true, color: WHITE, fontFace: "Calibri",
        align: "center", valign: "middle", margin: 0
      });
      s.addText(o.desc, {
        x: x + 0.2, y: 3.4, w: 4.0, h: 1.55,
        fontSize: 13, color: "333333", fontFace: "Calibri", valign: "middle", margin: 0
      });
    });

    s.addText("Vote: raise your hand for one. Then we'll complicate the answer.", {
      x: 0.5, y: 5.2, w: 9, h: 0.3,
      fontSize: 11, color: NAVY, fontFace: "Calibri", align: "center", italic: true, margin: 0
    });

    s.addNotes("Force a vote — hands up. Don't comment immediately. After the vote, reveal: both happened simultaneously. The Davenport & Srinivasan reading (Companies Laying Off Workers Because of AI's Potential, not Performance) argues this distinction is getting blurry and firms are making the case for displacement before the technology even proves itself.");
  }

  // ─── SLIDE 7: THE THREE FUTURES ───────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };

    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 10, h: 1.15,
      fill: { color: NAVY }, line: { color: NAVY }
    });
    s.addText("Three Futures Competing for the Same Workforce", {
      x: 0.4, y: 0, w: 9.2, h: 1.15,
      fontSize: 21, bold: true, color: WHITE, fontFace: "Cambria", valign: "middle", margin: 0
    });

    s.addText("PwC's Workforce of 2030 identifies three scenarios playing out simultaneously across sectors.", {
      x: 0.4, y: 1.25, w: 9.2, h: 0.38,
      fontSize: 12, italic: true, color: MGRAY, fontFace: "Calibri", margin: 0
    });

    const futures = [
      { name: "THE YELLOW WORLD", tag: "Humans first", color: GOLD,
        line1: "Work is human-centric. Firms value authenticity and ethics.",
        line2: "AI is a tool, not a strategy. Craftmanship and care-work dominate.",
        eg: "e.g. High-touch healthcare, artisan brands, community services" },
      { name: "THE GREEN WORLD", tag: "Purpose over profit", color: GREEN,
        line1: "Sustainability drives workforce decisions. Slow automation.",
        line2: "Reskilling is an ethical obligation, not a commercial choice.",
        eg: "e.g. B-corps, ESG-driven multinationals, NGOs" },
      { name: "THE RED WORLD", tag: "Innovation wins", color: RED,
        line1: "Speed of automation is a competitive advantage.",
        line2: "Workers either upskill fast or exit. No middle ground.",
        eg: "e.g. Fintech, logistics, AI-first startups — Klarna's playbook" },
    ];

    futures.forEach((f, i) => {
      const x = 0.35 + i * 3.12;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.75, w: 2.9, h: 3.4,
        fill: { color: LGRAY }, line: { color: "DDDDDD" }, rectRadius: 0.1, shadow: makeShadow()
      });
      // header band
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.75, w: 2.9, h: 0.85,
        fill: { color: f.color }, line: { color: f.color }, rectRadius: 0.1
      });
      s.addText(f.name, {
        x, y: 1.78, w: 2.9, h: 0.45,
        fontSize: 12, bold: true, color: WHITE, fontFace: "Calibri", align: "center", valign: "middle", margin: 0
      });
      s.addText(f.tag, {
        x, y: 2.2, w: 2.9, h: 0.35,
        fontSize: 10, color: WHITE, fontFace: "Calibri", align: "center", italic: true, margin: 0
      });
      s.addText(f.line1 + "\n\n" + f.line2, {
        x: x + 0.15, y: 2.72, w: 2.6, h: 1.65,
        fontSize: 11, color: "333333", fontFace: "Calibri", valign: "top", margin: 0
      });
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: x + 0.1, y: 4.5, w: 2.7, h: 0.5,
        fill: { color: "EEEEEE" }, line: { color: "CCCCCC" }, rectRadius: 0.06
      });
      s.addText(f.eg, {
        x: x + 0.1, y: 4.5, w: 2.7, h: 0.5,
        fontSize: 9, color: "555555", fontFace: "Calibri", italic: true, align: "center", valign: "middle", margin: 0
      });
    });

    s.addText("Source: PwC 'Workforce of the Future: The Competing Forces Shaping 2030'", {
      x: 0.4, y: 5.3, w: 9.2, h: 0.22,
      fontSize: 9, color: MGRAY, fontFace: "Calibri", italic: true, align: "right", margin: 0
    });

    s.addNotes("This is the PwC framework from the prescribed reading. Ask students: 'Which world are you being hired into?' Most MBAs will go into Red World firms — fintech, consulting, large tech-adjacent companies. The skill implication is different for each world. Follow up: 'Can a firm be in two worlds at once?'");
  }

  // ─── SLIDE 8: DISCUSSION PROMPT 3 ─────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: NAVY };

    s.addText("DISCUSSION", {
      x: 0.5, y: 0.35, w: 5, h: 0.35,
      fontSize: 11, bold: true, color: TEAL, fontFace: "Calibri", charSpacing: 3, margin: 0
    });

    s.addText("Which world is your\nfirst employer in?", {
      x: 0.5, y: 0.82, w: 5.5, h: 1.5,
      fontSize: 32, bold: true, color: WHITE, fontFace: "Cambria", margin: 0
    });

    s.addText("And — does it match what you want your career to look like?", {
      x: 0.5, y: 2.38, w: 5.5, h: 0.55,
      fontSize: 15, italic: true, color: "AABBCC", fontFace: "Calibri", margin: 0
    });

    // Right side prompts
    const prompts = [
      "How fast does the firm move when new AI tools become available?",
      "Does their reskilling promise match their hiring reality?",
      "What happened to the last role that was automated away?"
    ];
    prompts.forEach((p, i) => {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 6.1, y: 0.8 + i * 1.48, w: 3.5, h: 1.25,
        fill: { color: "122040" }, line: { color: TEAL, width: 1 }, rectRadius: 0.1
      });
      s.addText((i + 1) + "", {
        x: 6.1, y: 0.8 + i * 1.48, w: 0.55, h: 1.25,
        fontSize: 24, bold: true, color: TEAL, fontFace: "Cambria", align: "center", valign: "middle", margin: 0
      });
      s.addText(p, {
        x: 6.65, y: 0.9 + i * 1.48, w: 2.8, h: 1.0,
        fontSize: 11, color: WHITE, fontFace: "Calibri", valign: "middle", margin: 0
      });
    });

    s.addText("2 min reflection, then group share", {
      x: 0.5, y: 5.2, w: 9, h: 0.28,
      fontSize: 10, color: "556677", fontFace: "Calibri", italic: true, align: "center", margin: 0
    });

    s.addNotes("Personal reflection moment. The three questions on the right are interview-style due diligence questions students should be asking prospective employers. This bridges theory to their immediate reality as PGPM students entering the job market. Let it be personal.");
  }

  // ─── SLIDE 9: THE AUGMENTATION ADVANTAGE ──────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: LGRAY };

    s.addText("Why Augmentation May Beat Automation", {
      x: 0.4, y: 0.2, w: 9.2, h: 0.6,
      fontSize: 24, bold: true, color: NAVY, fontFace: "Cambria", margin: 0
    });
    s.addText("The reading that should change how you think about your first managerial decision.", {
      x: 0.4, y: 0.78, w: 9.2, h: 0.32,
      fontSize: 12, italic: true, color: MGRAY, fontFace: "Calibri", margin: 0
    });

    // Big quote block
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.4, y: 1.2, w: 9.2, h: 1.55,
      fill: { color: NAVY }, line: { color: NAVY }, rectRadius: 0.1
    });
    s.addText([
      { text: '"', options: { fontSize: 40, color: TEAL, bold: true } },
      { text: "Companies that choose AI augmentation — keeping humans central while using AI to amplify what they do — may win in the long run. Not because they move slower. Because they build something automation alone cannot: adaptive, accountable organisations.", options: { fontSize: 13, color: WHITE } }
    ], {
      x: 0.65, y: 1.3, w: 8.7, h: 1.35,
      fontFace: "Calibri", valign: "middle", margin: 0
    });
    s.addText("HBR | Why Companies That Choose AI Augmentation Over Automation May Win", {
      x: 0.4, y: 2.75, w: 9.2, h: 0.25,
      fontSize: 9, color: MGRAY, fontFace: "Calibri", italic: true, align: "right", margin: 0
    });

    // 3 evidence points
    const pts = [
      { stat: "Klarna", sub: "700 FTE equivalent replaced", note: "Customer satisfaction: unchanged. But institutional knowledge: gone.", c: RED },
      { stat: "Amazon", sub: "750K robots + 1.5M humans", note: "Productivity up. New roles emerged. Culture adapted over time.", c: TEAL },
      { stat: "IBM", sub: "7,800 roles to be replaced", note: "Announced before AI proved itself. Displacement driven by optics, not performance.", c: GOLD },
    ];
    pts.forEach((p, i) => {
      const x = 0.4 + i * 3.12;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 3.15, w: 2.9, h: 2.15,
        fill: { color: WHITE }, line: { color: "DDDDDD" }, rectRadius: 0.1, shadow: makeShadow()
      });
      s.addText(p.stat, {
        x: x + 0.15, y: 3.25, w: 2.6, h: 0.55,
        fontSize: 20, bold: true, color: p.c, fontFace: "Cambria", valign: "middle", margin: 0
      });
      s.addText(p.sub, {
        x: x + 0.15, y: 3.78, w: 2.6, h: 0.35,
        fontSize: 10, bold: true, color: MGRAY, fontFace: "Calibri", margin: 0
      });
      s.addText(p.note, {
        x: x + 0.15, y: 4.12, w: 2.6, h: 1.0,
        fontSize: 11, color: "333333", fontFace: "Calibri", valign: "top", margin: 0
      });
    });

    s.addNotes("Draw the contrast explicitly: Klarna moved fastest and got the headline metrics. Amazon moved deliberately and built something durable. IBM moved on optics. Ask: 'If you were the CHRO, which company's playbook would you defend to the board — and to your workers?'");
  }

  // ─── SLIDE 10: KEY TAKEAWAYS + CLOSING PROVOCATION ────────────────
  {
    const s = pres.addSlide();
    s.background = { color: NAVY };

    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.18, h: 5.625,
      fill: { color: GOLD }, line: { color: GOLD }
    });

    s.addText("What You Take Into Every Role From Here", {
      x: 0.4, y: 0.25, w: 9.2, h: 0.55,
      fontSize: 22, bold: true, color: WHITE, fontFace: "Cambria", margin: 0
    });

    const takes = [
      { n: "01", head: "AI changes demands, not just headcount.", body: "What work requires is shifting. Monitor your own job's demand profile — before someone else does." },
      { n: "02", head: "The floor isn't automation. It's judgment.", body: "Routine tasks compress in value. The judgment to know which problem matters: that appreciates." },
      { n: "03", head: "Speed and sustainability are both strategies.", body: "Klarna's speed and Amazon's deliberateness produced different organisations. Know which one you're building." },
      { n: "04", head: "Reskilling is a promise. Hold firms to it.", body: "Companies announce reskilling programs. Fewer deliver them. As a manager, that gap is your responsibility." },
    ];

    takes.forEach((t, i) => {
      const y = 0.95 + i * 1.1;
      s.addText(t.n, {
        x: 0.4, y, w: 0.65, h: 0.9,
        fontSize: 22, bold: true, color: TEAL, fontFace: "Cambria", valign: "middle", align: "center", margin: 0
      });
      s.addText(t.head, {
        x: 1.15, y: y + 0.02, w: 8.3, h: 0.38,
        fontSize: 14, bold: true, color: WHITE, fontFace: "Calibri", margin: 0
      });
      s.addText(t.body, {
        x: 1.15, y: y + 0.38, w: 8.3, h: 0.55,
        fontSize: 11, color: "AABBCC", fontFace: "Calibri", margin: 0
      });
      if (i < 3) {
        s.addShape(pres.shapes.LINE, {
          x: 0.4, y: y + 1.0, w: 9.2, h: 0,
          line: { color: "1A3055", width: 0.5 }
        });
      }
    });

    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.4, y: 5.1, w: 9.2, h: 0.38,
      fill: { color: GOLD }, line: { color: GOLD }, rectRadius: 0.06
    });
    s.addText("Next session: Talent Acquisition and AI-Enabled Hiring — who gets in the door, and who gets filtered out.", {
      x: 0.4, y: 5.1, w: 9.2, h: 0.38,
      fontSize: 11, bold: true, color: NAVY, fontFace: "Calibri", align: "center", valign: "middle", margin: 0
    });

    s.addNotes("Close with point 04 — it's the one that gives MBAs an active role in this story. They won't be individual contributors forever. The moment they manage a team, the automation vs augmentation decision belongs to them. Leave them with that weight intentionally.");
  }

  await pres.writeFile({ fileName: "d:\\NashAudit\\output\\Module1_Instructional_Deck.pptx" });
  console.log("Done");
}

build().catch(console.error);