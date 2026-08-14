/**
 * Expands the compact syllabus source below into data/syllabus/*.json.
 *
 * This is a one-off authoring tool, not a build step — the app reads the
 * emitted JSON directly. Re-run with:  node tools/build-syllabus.mjs
 *
 * Node format:  "code|title|tier|phase"
 *   tier  = SL | AHL   (AHL means HL-only content)
 *   phase = 1 | 2      (DP year; a default guess, editable in the app)
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'data/syllabus';

const SUBJECTS = [
  { id: 'math-aa-hl',       name: 'Mathematics: Analysis & Approaches', short: 'Math AA',   level: 'HL', group: 5, callsign: 'AXIS',     colorKey: 's1' },
  { id: 'physics-hl',       name: 'Physics',                            short: 'Physics',   level: 'HL', group: 4, callsign: 'THRUST',   colorKey: 's2' },
  { id: 'economics-hl',     name: 'Economics',                          short: 'Economics', level: 'HL', group: 3, callsign: 'YIELD',    colorKey: 's3' },
  { id: 'chemistry-sl',     name: 'Chemistry',                          short: 'Chemistry', level: 'SL', group: 4, callsign: 'CATALYST', colorKey: 's4' },
  { id: 'portugues-lal-sl', name: 'Português A: Language & Literature',  short: 'Português', level: 'SL', group: 1, callsign: 'LÉXICO',   colorKey: 's5' },
  { id: 'english-lal-sl',   name: 'English A: Language & Literature',    short: 'English',   level: 'SL', group: 1, callsign: 'RHETOR',   colorKey: 's6' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Mathematics: Analysis and Approaches HL
// ─────────────────────────────────────────────────────────────────────────────
const MATH_AA_HL = {
  guide: 'Mathematics: Analysis and Approaches guide (first assessment 2021)',
  verified: false,
  topics: [
    ['1', 'Number and algebra', [
      '1.1|Operations with numbers in the form a×10^k; scientific notation|SL|1',
      '1.2|Arithmetic sequences and series; sigma notation; applications|SL|1',
      '1.3|Geometric sequences and series; sigma notation; applications|SL|1',
      '1.4|Financial applications of geometric sequences and series|SL|1',
      '1.5|Laws of exponents with integer exponents; introduction to logarithms|SL|1',
      '1.6|Simple deductive proof; numerical and algebraic manipulation|SL|1',
      '1.7|Laws of exponents with rational exponents; laws of logarithms; change of base|SL|1',
      '1.8|Sum of infinite convergent geometric sequences|SL|1',
      '1.9|The binomial theorem; binomial coefficients|SL|1',
      '1.10|Counting principles; permutations and combinations; extension of the binomial theorem|AHL|2',
      '1.11|Partial fractions|AHL|2',
      '1.12|Complex numbers: Cartesian form, the complex plane, terminology|AHL|2',
      '1.13|Modulus-argument (polar) and exponential (Euler) form|AHL|2',
      '1.14|Complex conjugate roots; De Moivre’s theorem; powers and roots|AHL|2',
      '1.15|Proof by mathematical induction, contradiction, and counterexample|AHL|2',
      '1.16|Solutions of systems of linear equations (up to three unknowns)|AHL|2',
    ]],
    ['2', 'Functions', [
      '2.1|Equations of straight lines; gradient; parallel and perpendicular lines|SL|1',
      '2.2|Concept of a function; domain, range, graph; inverse and its graph|SL|1',
      '2.3|Graphing functions with technology; key features|SL|1',
      '2.4|Key features of graphs; intersections; symmetry; asymptotes|SL|1',
      '2.5|Composite functions; identity function; finding the inverse|SL|1',
      '2.6|The quadratic function and its graph|SL|1',
      '2.7|Solution of quadratic equations and inequalities; the discriminant|SL|1',
      '2.8|The reciprocal function; rational functions of the form (ax+b)/(cx+d)|SL|1',
      '2.9|Exponential and logarithmic functions|SL|1',
      '2.10|Solving equations graphically and analytically; applications|SL|1',
      '2.11|Transformations of graphs: translations, reflections, stretches|SL|1',
      '2.12|Polynomial functions; factor and remainder theorems; sum and product of roots|AHL|2',
      '2.13|Rational functions with quadratic terms|AHL|2',
      '2.14|Odd and even functions; self-inverse; inverses with restricted domain|AHL|2',
      '2.15|Solutions of g(x) ≥ f(x), graphically and analytically|AHL|2',
      '2.16|The graphs of |y|=f(x), y=1/f(x), y=f(|x|), y=[f(x)]²|AHL|2',
    ]],
    ['3', 'Geometry and trigonometry', [
      '3.1|Distance and midpoint in 3D; volume and surface area of 3D solids; angles in solids|SL|1',
      '3.2|The sine rule, the cosine rule, and the area of a triangle|SL|1',
      '3.3|Applications: angles of elevation and depression, bearings|SL|1',
      '3.4|Radian measure; length of an arc; area of a sector|SL|1',
      '3.5|Definition of sin, cos, tan from the unit circle; exact values|SL|1',
      '3.6|The Pythagorean identity; double angle identities for sine and cosine|SL|1',
      '3.7|Circular functions; amplitude, period, transformations; graphs|SL|1',
      '3.8|Solving trigonometric equations in a finite interval|SL|1',
      '3.9|Reciprocal trigonometric ratios; inverse functions and their domains|AHL|2',
      '3.10|Compound angle identities; double angle identity for tangent|AHL|2',
      '3.11|Relationships between trigonometric functions; symmetry properties|AHL|2',
      '3.12|Vectors: displacement, components, magnitude, algebra of vectors|AHL|2',
      '3.13|The scalar (dot) product; angle between two vectors; perpendicularity|AHL|2',
      '3.14|Vector equation of a line in two and three dimensions|AHL|2',
      '3.15|Coincident, parallel, intersecting and skew lines; points of intersection|AHL|2',
      '3.16|The vector (cross) product; geometric interpretation; areas|AHL|2',
      '3.17|Vector equation of a plane; Cartesian and normal forms|AHL|2',
      '3.18|Intersections of lines and planes; angles between lines and planes|AHL|2',
    ]],
    ['4', 'Statistics and probability', [
      '4.1|Population, sample, random sample; sampling techniques; reliability of data|SL|2',
      '4.2|Presentation of data; histograms; cumulative frequency; box plots; outliers|SL|2',
      '4.3|Measures of central tendency and dispersion; effect of constant changes|SL|2',
      '4.4|Linear correlation; Pearson’s r; the regression line y on x|SL|2',
      '4.5|Trial, outcome, sample space, event; probability; complementary events|SL|2',
      '4.6|Combined events; mutually exclusive events; conditional probability; independence|SL|2',
      '4.7|Discrete random variables; expected value|SL|2',
      '4.8|The binomial distribution; mean and variance|SL|2',
      '4.9|The normal distribution and curve; standardization of normal variables|SL|2',
      '4.10|Equation of the regression line x on y; predictions|SL|2',
      '4.11|Formal definition and use of conditional probability and independence|SL|2',
      '4.12|Standardization of normal variables (z-values); inverse normal calculations|SL|2',
      '4.13|Use of Bayes’ theorem for a maximum of three events|AHL|2',
      '4.14|Variance of a discrete random variable; continuous random variables and PDFs|AHL|2',
    ]],
    ['5', 'Calculus', [
      '5.1|Introduction to the concept of a limit; derivative as gradient and rate of change|SL|1',
      '5.2|Increasing and decreasing functions; graphical interpretation of the derivative|SL|1',
      '5.3|Derivative of x^n; differentiation of polynomials|SL|1',
      '5.4|Tangents and normals at a given point|SL|1',
      '5.5|Introduction to integration as anti-differentiation; definite integrals; area|SL|1',
      '5.6|Derivatives of sin, cos, tan, e^x, ln x; chain, product and quotient rules|SL|2',
      '5.7|The second derivative; graphical behaviour of functions|SL|2',
      '5.8|Local maximum and minimum points; points of inflexion; optimisation|SL|2',
      '5.9|Kinematic problems: displacement, velocity, acceleration; total distance|SL|2',
      '5.10|Indefinite integral; integration by inspection and by substitution|SL|2',
      '5.11|Definite integrals; area between a curve and the x-axis or between curves|SL|2',
      '5.12|Continuity and differentiability; derivative from first principles; higher derivatives|AHL|2',
      '5.13|Evaluation of limits using L’Hôpital’s rule or the Maclaurin series|AHL|2',
      '5.14|Implicit differentiation; related rates of change; optimisation problems|AHL|2',
      '5.15|Derivatives and integrals of sec, csc, cot, a^x, log_a x, arcsin, arccos, arctan|AHL|2',
      '5.16|Integration by substitution and by parts; repeated integration by parts|AHL|2',
      '5.17|Area enclosed by a curve and the y-axis; volumes of revolution|AHL|2',
      '5.18|First order differential equations; Euler’s method; separable variables; integrating factor|AHL|2',
      '5.19|Maclaurin series; expansions by substitution, products, differentiation and integration|AHL|2',
    ]],
    ['IA', 'Internal assessment', [
      'IA.1|Mathematical exploration: choosing a topic|SL|2',
      'IA.2|Mathematical exploration: mathematical presentation and rigour|SL|2',
      'IA.3|Mathematical exploration: personal engagement and reflection|SL|2',
    ]],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Physics HL — 2023 guide (first assessment 2025), Themes A–E
// ─────────────────────────────────────────────────────────────────────────────
const PHYSICS_HL = {
  guide: 'Physics guide (first assessment 2025)',
  verified: false,
  topics: [
    ['A', 'Space, time and motion', [
      'A.1|Kinematics|SL|1',
      'A.2|Forces and momentum|SL|1',
      'A.3|Work, energy and power|SL|1',
      'A.4|Rigid body mechanics|AHL|2',
      'A.5|Galilean and special relativity|AHL|2',
    ]],
    ['B', 'The particulate nature of matter', [
      'B.1|Thermal energy transfers|SL|1',
      'B.2|Greenhouse effect|SL|1',
      'B.3|Gas laws|SL|1',
      'B.4|Thermodynamics|AHL|2',
      'B.5|Current and circuits|SL|2',
    ]],
    ['C', 'Wave behaviour', [
      'C.1|Simple harmonic motion|SL|2',
      'C.2|Wave model|SL|1',
      'C.3|Wave phenomena|SL|2',
      'C.4|Standing waves and resonance|SL|2',
      'C.5|Doppler effect|SL|2',
    ]],
    ['D', 'Fields', [
      'D.1|Gravitational fields|SL|2',
      'D.2|Electric and magnetic fields|SL|2',
      'D.3|Motion in electromagnetic fields|SL|2',
      'D.4|Induction|AHL|2',
    ]],
    ['E', 'Nuclear and quantum physics', [
      'E.1|Structure of the atom|SL|2',
      'E.2|Quantum physics|AHL|2',
      'E.3|Radioactive decay|SL|2',
      'E.4|Fission|SL|2',
      'E.5|Fusion and stars|SL|2',
    ]],
    ['T', 'Tools and inquiry', [
      'T.1|Experimental techniques: safe, ethical, effective measurement|SL|1',
      'T.2|Technology: data collection, spreadsheets, graphing, simulations|SL|1',
      'T.3|Mathematics: uncertainties, error propagation, linearisation|SL|1',
      'T.4|Inquiry: designing, collecting, processing, concluding, evaluating|SL|1',
    ]],
    ['IA', 'Internal assessment', [
      'IA.1|Scientific investigation: research question and design|SL|2',
      'IA.2|Scientific investigation: data collection and processing|SL|2',
      'IA.3|Scientific investigation: analysis, conclusion and evaluation|SL|2',
    ]],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Chemistry SL — 2023 guide (first assessment 2025)
// ─────────────────────────────────────────────────────────────────────────────
const CHEMISTRY_SL = {
  guide: 'Chemistry guide (first assessment 2025)',
  verified: false,
  topics: [
    ['S1', 'Structure 1 — Models of the particulate nature of matter', [
      'S1.1|Introduction to the particulate nature of matter|SL|1',
      'S1.2|The nuclear atom|SL|1',
      'S1.3|Electron configurations|SL|1',
      'S1.4|Counting particles by mass: the mole|SL|1',
      'S1.5|Ideal gases|SL|1',
    ]],
    ['S2', 'Structure 2 — Models of bonding and structure', [
      'S2.1|The ionic model|SL|1',
      'S2.2|The covalent model|SL|1',
      'S2.3|The metallic model|SL|1',
      'S2.4|From models to materials|SL|1',
    ]],
    ['S3', 'Structure 3 — Classification of matter', [
      'S3.1|The periodic table: classification of elements|SL|1',
      'S3.2|Functional groups: classification of organic compounds|SL|2',
    ]],
    ['R1', 'Reactivity 1 — What drives chemical reactions?', [
      'R1.1|Measuring enthalpy changes|SL|2',
      'R1.2|Energy cycles in reactions|SL|2',
      'R1.3|Energy from fuels|SL|2',
    ]],
    ['R2', 'Reactivity 2 — How much, how fast and how far?', [
      'R2.1|How much? The amount of chemical change|SL|2',
      'R2.2|How fast? The rate of chemical change|SL|2',
      'R2.3|How far? The extent of chemical change|SL|2',
    ]],
    ['R3', 'Reactivity 3 — What are the mechanisms of chemical change?', [
      'R3.1|Proton transfer reactions|SL|2',
      'R3.2|Electron transfer reactions|SL|2',
      'R3.3|Electron sharing reactions|SL|2',
      'R3.4|Electron-pair sharing reactions|SL|2',
    ]],
    ['T', 'Tools and inquiry', [
      'T.1|Experimental techniques|SL|1',
      'T.2|Technology: data collection and processing|SL|1',
      'T.3|Mathematics: uncertainties and graphing|SL|1',
      'T.4|Inquiry: design, collection, conclusion, evaluation|SL|1',
    ]],
    ['IA', 'Internal assessment', [
      'IA.1|Scientific investigation: research question and design|SL|2',
      'IA.2|Scientific investigation: data collection and processing|SL|2',
      'IA.3|Scientific investigation: analysis, conclusion and evaluation|SL|2',
    ]],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Economics HL — 2020 guide (first assessment 2022)
// ─────────────────────────────────────────────────────────────────────────────
const ECONOMICS_HL = {
  guide: 'Economics guide (first assessment 2022) — EDITION UNCONFIRMED for May 2028',
  verified: false,
  topics: [
    ['1', 'Introduction to economics', [
      '1.1|What is economics? Scarcity, choice, opportunity cost, the basic questions|SL|1',
      '1.2|How do economists approach the world? Models, ceteris paribus, positive vs normative|SL|1',
    ]],
    ['2', 'Microeconomics', [
      '2.1|Demand|SL|1',
      '2.2|Supply|SL|1',
      '2.3|Competitive market equilibrium|SL|1',
      '2.4|Critique of the maximizing behaviour of consumers and producers|SL|1',
      '2.5|Elasticity of demand (PED and YED)|SL|1',
      '2.6|Elasticity of supply (PES)|SL|1',
      '2.7|Role of government in microeconomics: taxes, subsidies, price controls|SL|1',
      '2.8|Market failure — externalities and common pool resources|SL|1',
      '2.9|Market failure — public goods|SL|1',
      '2.10|Market failure — asymmetric information|AHL|2',
      '2.11|Market failure — market power|AHL|2',
      '2.12|The market’s inability to achieve equity|AHL|2',
    ]],
    ['3', 'Macroeconomics', [
      '3.1|Measuring economic activity and illustrating its variations|SL|1',
      '3.2|Aggregate demand and aggregate supply|SL|1',
      '3.3|Macroeconomic objectives: growth, low unemployment, low inflation|SL|2',
      '3.4|Economics of inequality and poverty|SL|2',
      '3.5|Demand management — monetary policy|SL|2',
      '3.6|Demand management — fiscal policy|SL|2',
      '3.7|Supply-side policies|SL|2',
    ]],
    ['4', 'The global economy', [
      '4.1|Benefits of international trade|SL|2',
      '4.2|Types of trade protection|SL|2',
      '4.3|Arguments for and against trade control and protection|SL|2',
      '4.4|Economic integration|SL|2',
      '4.5|Exchange rates|SL|2',
      '4.6|Balance of payments|SL|2',
      '4.7|Sustainable development|SL|2',
      '4.8|Measuring development|SL|2',
      '4.9|Barriers to economic growth and development|SL|2',
      '4.10|Economic growth and development strategies|SL|2',
    ]],
    ['K', 'Key concepts', [
      'K.1|Scarcity|SL|1',
      'K.2|Choice|SL|1',
      'K.3|Efficiency|SL|1',
      'K.4|Equity|SL|1',
      'K.5|Economic well-being|SL|1',
      'K.6|Sustainability|SL|1',
      'K.7|Change|SL|1',
      'K.8|Interdependence|SL|1',
      'K.9|Intervention|SL|1',
    ]],
    ['IA', 'Internal assessment', [
      'IA.1|Commentary 1 — microeconomics|SL|1',
      'IA.2|Commentary 2 — macroeconomics|SL|2',
      'IA.3|Commentary 3 — the global economy|SL|2',
    ]],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Language A: Language and Literature SL — 2019 guide (first assessment 2021)
// Shared shape for both English and Português.
// ─────────────────────────────────────────────────────────────────────────────
function langAndLit(lang) {
  return {
    guide: 'Language A: Language and Literature guide (first assessment 2021)',
    verified: false,
    topics: [
      ['AOE', 'Areas of exploration', [
        'AOE.1|Readers, writers and texts|SL|1',
        'AOE.2|Time and space|SL|1',
        'AOE.3|Intertextuality: connecting texts|SL|2',
      ]],
      ['C', 'Course concepts', [
        'C.1|Identity|SL|1',
        'C.2|Culture|SL|1',
        'C.3|Creativity|SL|1',
        'C.4|Communication|SL|1',
        'C.5|Perspective|SL|1',
        'C.6|Transformation|SL|2',
        'C.7|Representation|SL|2',
      ]],
      ['P1', 'Paper 1 — Guided textual analysis (non-literary)', [
        'P1.1|Advertisement and appeal|SL|1',
        'P1.2|Opinion column and editorial|SL|1',
        'P1.3|Speech and rhetoric|SL|1',
        'P1.4|News article and report|SL|1',
        'P1.5|Blog, social media and digital text|SL|1',
        'P1.6|Cartoon, comic and graphic text|SL|1',
        'P1.7|Photograph and image analysis|SL|1',
        'P1.8|Infographic and data visualisation|SL|2',
        'P1.9|Brochure, pamphlet and public information|SL|2',
        'P1.10|Travel writing, memoir and diary|SL|2',
        'P1.11|Interview and transcript|SL|2',
        'P1.12|Manifesto, propaganda and parody|SL|2',
        'P1.13|Responding to the guiding question under timed conditions|SL|2',
      ]],
      ['P2', 'Paper 2 — Comparative essay', [
        'P2.1|Selecting two works for meaningful comparison|SL|2',
        'P2.2|Structuring a comparative argument|SL|2',
        'P2.3|Integrating textual evidence from both works|SL|2',
        'P2.4|Addressing the question under timed conditions|SL|2',
      ]],
      ['IO', 'Individual Oral', [
        'IO.1|Choosing a global issue|SL|2',
        'IO.2|Selecting and justifying the two extracts|SL|2',
        'IO.3|Structuring the 10-minute oral|SL|2',
        'IO.4|Responding to follow-up questions|SL|2',
      ]],
      ['LP', 'Learner portfolio', [
        'LP.1|Recording responses to each work and text|SL|1',
        'LP.2|Connecting works to areas of exploration and concepts|SL|1',
        'LP.3|Preparing assessment groundwork|SL|2',
      ]],
      ['W', 'Works and texts studied', [
        'W.1|Literary work 1|SL|1',
        'W.2|Literary work 2|SL|1',
        'W.3|Literary work 3|SL|2',
        'W.4|Literary work 4|SL|2',
        'W.5|Non-literary body of work 1|SL|1',
        'W.6|Non-literary body of work 2|SL|2',
      ]],
    ],
    lang,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: TOK, EE, CAS
// ─────────────────────────────────────────────────────────────────────────────
const CORE = {
  guide: 'Theory of Knowledge guide (first assessment 2022); EE and CAS guides',
  verified: false,
  topics: [
    ['TOK', 'Theory of Knowledge', [
      'TOK.1|Core theme: knowledge and the knower|SL|1',
      'TOK.2|Optional theme: knowledge and technology|SL|1',
      'TOK.3|Optional theme: knowledge and language|SL|1',
      'TOK.4|Optional theme: knowledge and politics|SL|2',
      'TOK.5|Optional theme: knowledge and religion|SL|2',
      'TOK.6|Optional theme: knowledge and indigenous societies|SL|2',
      'TOK.7|Area of knowledge: history|SL|1',
      'TOK.8|Area of knowledge: the human sciences|SL|1',
      'TOK.9|Area of knowledge: the natural sciences|SL|1',
      'TOK.10|Area of knowledge: the arts|SL|2',
      'TOK.11|Area of knowledge: mathematics|SL|2',
      'TOK.12|Exhibition: selecting three objects|SL|1',
      'TOK.13|Exhibition: writing the commentary|SL|1',
      'TOK.14|Essay: unpacking the prescribed title|SL|2',
      'TOK.15|Essay: developing and evaluating perspectives|SL|2',
      'TOK.16|Essay: final submission|SL|2',
    ]],
    ['EE', 'Extended Essay', [
      'EE.1|Choosing a subject and supervisor|SL|1',
      'EE.2|Formulating the research question|SL|1',
      'EE.3|Reflection session 1|SL|1',
      'EE.4|Research and source gathering|SL|1',
      'EE.5|Interim reflection session|SL|2',
      'EE.6|First full draft|SL|2',
      'EE.7|Revision and referencing|SL|2',
      'EE.8|Viva voce and final reflection|SL|2',
      'EE.9|Final submission|SL|2',
    ]],
    ['CAS', 'Creativity, Activity, Service', [
      'CAS.1|LO1: identify own strengths and areas for growth|SL|1',
      'CAS.2|LO2: undertake new challenges and develop new skills|SL|1',
      'CAS.3|LO3: initiate and plan a CAS experience|SL|1',
      'CAS.4|LO4: show commitment to and perseverance in CAS|SL|1',
      'CAS.5|LO5: demonstrate the skills and benefits of collaboration|SL|2',
      'CAS.6|LO6: engage with issues of global significance|SL|2',
      'CAS.7|LO7: recognize and consider the ethics of choices and actions|SL|2',
      'CAS.8|CAS project (at least one month, collaborative)|SL|2',
      'CAS.9|Three formal CAS interviews|SL|2',
    ]],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

function expand(subjectId, src) {
  return {
    subjectId,
    guide: src.guide,
    verified: src.verified,
    topics: src.topics.map(([code, title, nodes]) => ({
      code,
      title,
      // Split from both ends: titles may legitimately contain '|' (e.g. |y|=f(x)).
      nodes: nodes.map(line => {
        const parts = line.split('|');
        const phase = parts.pop();
        const tier = parts.pop();
        const code = parts.shift();
        return { code, title: parts.join('|'), tier, phase: `DP${phase}` };
      }),
    })),
  };
}

const TREES = {
  'math-aa-hl':       MATH_AA_HL,
  'physics-hl':       PHYSICS_HL,
  'economics-hl':     ECONOMICS_HL,
  'chemistry-sl':     CHEMISTRY_SL,
  'portugues-lal-sl': langAndLit('pt'),
  'english-lal-sl':   langAndLit('en'),
  'core':             CORE,
};

mkdirSync(OUT, { recursive: true });
mkdirSync('data', { recursive: true });

writeFileSync('data/subjects.json', JSON.stringify({
  session: '2028-05',
  dpStart: '2026-08',
  examStart: '2028-04-28',
  subjects: SUBJECTS,
}, null, 2) + '\n');

let total = 0;
for (const [id, src] of Object.entries(TREES)) {
  const tree = expand(id, src);
  const n = tree.topics.reduce((a, t) => a + t.nodes.length, 0);
  total += n;
  writeFileSync(`${OUT}/${id}.json`, JSON.stringify(tree, null, 2) + '\n');
  const dp1 = tree.topics.flatMap(t => t.nodes).filter(x => x.phase === 'DP1').length;
  console.log(`${id.padEnd(20)} ${String(n).padStart(3)} nodes   DP1 ${dp1}  DP2 ${n - dp1}`);
}
console.log(`${''.padEnd(20)} ${String(total).padStart(3)} total`);
