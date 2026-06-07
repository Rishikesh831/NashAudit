from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY

doc = SimpleDocTemplate(
    "/mnt/user-data/outputs/specific_problem.pdf",
    pagesize=A4,
    leftMargin=2.8*cm,
    rightMargin=2.8*cm,
    topMargin=2.5*cm,
    bottomMargin=2.5*cm,
)

styles = getSampleStyleSheet()

meta = ParagraphStyle("meta",
    fontName="Helvetica", fontSize=9, leading=14,
    textColor=colors.HexColor("#555555"), alignment=TA_LEFT)

title_style = ParagraphStyle("title_style",
    fontName="Helvetica-Bold", fontSize=15, leading=20,
    textColor=colors.HexColor("#0F6E56"), spaceBefore=8, spaceAfter=4)

body = ParagraphStyle("body",
    fontName="Helvetica", fontSize=10.5, leading=17,
    textColor=colors.HexColor("#1A1A18"), spaceAfter=10,
    alignment=TA_JUSTIFY)

story = []

# Header
story.append(Paragraph("Rishikesh Bhatt", ParagraphStyle("name",
    fontName="Helvetica-Bold", fontSize=18, leading=22,
    textColor=colors.HexColor("#0F6E56"), spaceAfter=2)))
story.append(Paragraph(
    "S.P.I.T Mumbai &nbsp;|&nbsp; B.Tech Electronics &amp; Telecommunication, 2nd Year &nbsp;|&nbsp; CGPA 8.33",
    meta))
story.append(Paragraph(
    "Faculty: <b>Dr. Anuj Vora, Jio Institute</b>",
    meta))
story.append(Spacer(1, 10))
story.append(HRFlowable(width="100%", thickness=0.5,
    color=colors.HexColor("#1D9E75"), spaceAfter=12))

story.append(Paragraph(
    "The Problem of Commitment Credibility in Repeated Stackelberg Audit Games",
    title_style))
story.append(Spacer(1, 6))

paragraphs = [

    ("The Stackelberg security game framework for fraud deterrence rests on a foundational "
     "assumption: <b>the auditor can commit credibly to an announced audit policy.</b> This "
     "commitment is what gives the leader its strategic power. A rational fraudster, observing "
     "a committed audit rate q, computes their expected payoff and decides not to act if "
     "E[cheat] is non-positive. The deterrence guarantee holds entirely because the fraudster "
     "believes the commitment will be honoured."),

    ("In practice, this assumption breaks. <b>Real auditors face budget volatility, regulatory "
     "shifts, and operational constraints that cause the executed audit rate to deviate from "
     "the committed rate — often systematically and predictably.</b> A fraudster who observes "
     "audit history across multiple rounds will notice this gap. Using fictitious play — "
     "forming a belief about the true audit rate as a running average of observed executions — "
     "they update their strategy accordingly. If the executed rate consistently undershoots the "
     "commitment, the deterrence guarantee degrades silently. The system appears to be working "
     "while the fraudster has already re-entered the profitable region."),

    ("This is the specific problem I want to study: <b>how does Stackelberg deterrence degrade "
     "under partial commitment, how quickly does a learning fraudster detect and exploit this "
     "gap, and what mechanism design interventions can restore deterrence without requiring "
     "full commitment?</b> To my knowledge, this question has not been formally addressed in "
     "the digital payments context. The closest work — on commitment devices in repeated games "
     "and approximate mechanism design — treats commitment failure as a theoretical curiosity "
     "rather than an operational reality with measurable consequences."),

    ("My background positions me unusually well to study this during an internship. "
     "<b>I have already built the baseline system.</b> NashAudit implements the full "
     "Stackelberg pipeline — the audit allocation LP, the fictitious play belief update, "
     "the bilateral convergence tracking — in working Python code. The credibility gap "
     "(q_committed minus q_hat, the fraudster's belief) is already a live KPI in the "
     "system's dashboard. This means the internship does not need to be spent building "
     "infrastructure. It can begin immediately with the theoretical question: what is "
     "the functional relationship between the magnitude of commitment failure and the "
     "rate at which a fictitious-play fraudster returns to active fraud?"),

    ("The skills required to answer this are ones I have developed concretely. "
     "<b>The game-theoretic formulation</b> — extending the two-penalty payoff model to "
     "account for a stochastic commitment gap — requires mechanism design fluency I have "
     "built through NashAudit. <b>The LP formulations</b> for the CE mediator and Stackelberg "
     "solver, already implemented via scipy, would need to be modified to incorporate "
     "commitment uncertainty as a parameter. <b>The empirical simulation</b> of fraudster "
     "learning under varying commitment failure rates is directly supported by the Thompson "
     "Sampling and fictitious play components already in the codebase. And the "
     "<b>Barclays AML pipeline</b> gives me a realistic understanding of why commitment "
     "failure happens in practice — not as a theoretical edge case but as a routine "
     "consequence of how audit teams actually operate."),

    ("The question also connects naturally to Dr. Vora's existing work. <b>The information "
     "structure of a game with imperfect commitment is a form of the asymmetric sender "
     "problem explored in Shannon Meets Myerson</b> — the fraudster is inferring the "
     "auditor's true type from observed actions, not just responding to the stated policy. "
     "Studying how the mediator's incentive compatibility constraints must be modified when "
     "commitment is probabilistic rather than certain feels like a direct extension of "
     "that framework into the repeated-game setting."),

    ("The specific deliverable I would aim for over the course of the internship is a "
     "formal characterisation of the <b>commitment credibility threshold</b> — the minimum "
     "execution consistency required to sustain deterrence against a learning fraudster — "
     "and at least one mechanism design intervention (such as a randomised commitment "
     "device or a penalty-adjusted audit policy) that restores deterrence below that "
     "threshold. Whether that results in a paper, a technical report, or a well-documented "
     "research prototype, I am prepared to work toward whichever output is most useful "
     "to Dr. Vora's research agenda."),
]

for p in paragraphs:
    story.append(Paragraph(p, body))

doc.build(story)
print("PDF generated.")