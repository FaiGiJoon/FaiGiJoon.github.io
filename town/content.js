// What Goldenrod says about Casper. Doors are keyed by the door tile ("x,y") from
// GoldenrodCity_MapEvents; signs by their tile; NPCs are placed on open floor.
// Text uses only characters the Crystal font has (plus '@' and '+', drawn by hand).

const EMAIL = 'klootwijkc@gmail.com';
const GITHUB = 'https://github.com/FaiGiJoon';

export default {
  title: 'GOLDENROD CITY',
  start: { x: 22, y: 19, facing: 'up' },

  intro: [
    'Welcome to GOLDENROD CITY, the portfolio town of CASPER KLOOTWIJK!',
    'Every building tells you about Casper. Talk to people, read signs and open doors. The GYM leader is RED!',
  ],

  buildings: {
    '24,7': {
      name: 'GOLDENROD GYM', kind: 'battle', href: 'red-battle/',
      text: ['GYM LEADER RED is waiting inside.', 'All POKéMON battle at Lv60. Take on the challenge?'],
    },
    '15,27': {
      name: 'POKéMON CENTER', kind: 'page', title: 'ABOUT CASPER',
      body: [
        'Casper Klootwijk is a System Support Engineer from Utrecht, Netherlands.',
        'Hands-on with IT infrastructure, network configuration and cloud workplace tools.',
        'Supported employees at global companies like FedEx and Prosus, configures network equipment at Axis, and taught networks, servers and cybersecurity at ROC van Amsterdam.',
        'AT A GLANCE',
        'Currently: System Support Engineer at Axis',
        'Focus: networking, identity & access, workplace IT',
        'Availability: open to freelance & full-time roles',
      ],
    },
    '9,13': {
      name: 'MAGNET TRAIN STATION', kind: 'page', title: 'CAREER LINE',
      body: [
        'NOW: AXIS',
        'System Support Engineer, Oct 2025 - now. Configures MikroTik network equipment over SSH, maintains and refurbishes IoT devices and restores systems fast so client services stay safe.',
        'PROSUS GROUP',
        'Google Workspace Support, Jun 2025 - Oct 2025. Helped migrate the company from Microsoft 365 to Google Workspace, managed identity with Okta and Active Directory, and built Google AppSheet apps with JavaScript.',
        'FEDEX LOGISTICS',
        'ICT Support Specialist, Jan 2024 - Jun 2025. Kept warehouse IT running: sorting, conveyor belts and cameras. Service desk incidents and Microsoft 365 help.',
        'ROC VAN AMSTERDAM',
        'Assistant Teacher, Jul 2023 - Nov 2023. Taught MBO Level 4 ICT students networks, the OSI model, Windows Server, Hyper-V and cybersecurity.',
      ],
    },
    '24,27': {
      name: 'GOLDENROD DEPT. STORE', kind: 'page', title: 'SKILLS & TOOLS',
      body: [
        '1F ELECTRIC: NETWORKING',
        'MikroTik, network configuration, wireless access points, SSH / PuTTY, IoT devices.',
        '2F PSYCHIC: IDENTITY & WORKPLACE',
        'Google Workspace, Microsoft 365, Okta, Active Directory, onboarding and migrations.',
        '3F STEEL: SYSTEMS',
        'Windows Server, Hyper-V, Microsoft Azure, hardware troubleshooting, OS installation.',
        '4F GRASS: AUTOMATION & SUPPORT',
        'Google AppSheet, JavaScript, service desk and incidents, teaching and documentation, SIEM.',
      ],
    },
    '14,21': {
      name: 'GAME CORNER', kind: 'projects', title: 'PROJECTS',
      body: ['The newest public projects, live from GitHub. Pick one to open it.'],
      links: [{ label: 'ALL ON GITHUB', href: GITHUB }],
    },
    '5,15': {
      name: 'RADIO TOWER', kind: 'page', title: 'CONTACT',
      body: [
        'Casper is open to freelance and full-time roles in IT support, systems and networking.',
        'Email is the quickest way to reach Casper.',
        `EMAIL: ${EMAIL}`,
        'GITHUB: github.com/FaiGiJoon',
        'Utrecht, Netherlands (CET)',
      ],
      links: [
        { label: 'SEND AN EMAIL', href: `mailto:${EMAIL}` },
        { label: 'OPEN GITHUB', href: GITHUB },
      ],
    },
    '15,7': {
      name: 'NAME RATER', kind: 'page', title: 'TRAINER CARD',
      body: [
        'Hm, CASPER KLOOTWIJK... What a splendid name!',
        "Casper's full CV is a PDF, written in Dutch.",
      ],
      links: [{ label: 'OPEN THE CV (PDF)', href: 'assets/CV_Casper_Klootwijk_NL.pdf' }],
    },
    '5,25': {
      name: "BILL'S FAMILY'S HOUSE", kind: 'page', title: 'HOW IT STARTED',
      body: [
        "Casper's interest in tech started with POKéMON PLATINUM and the DeSmuME emulator.",
        'Figuring out how an emulator worked was the lightbulb moment. By 13, Casper was hooked on computers.',
        'In 2015 came the first IT internship: building and refurbishing PCs and setting them up with the brand-new Windows 10.',
        "Seeing someone's slow computer feel new again is what made Casper want to help people through technology.",
      ],
    },
    '31,21': {
      name: 'HAPPINESS RATER', kind: 'page', title: 'THE BIG GOAL',
      body: [
        'Long term, Casper wants to build automation software and new technology that helps hospitals around the world.',
      ],
    },
    '29,29': {
      name: 'BIKE SHOP', kind: 'page', title: 'OUTSIDE OF WORK',
      body: [
        'Gym, running and cycling through nature.',
        'Drum & Bass. Shout-out to Hedex and GUV!',
        'POKéMON Nuzlockes, for the challenge.',
      ],
    },
    '29,5': {
      name: 'FLOWER SHOP', kind: 'page', title: 'BLOG',
      body: ['Fresh posts grow here. Have a look at the blog!'],
      links: [{ label: 'READ THE BLOG', href: 'blog.html' }],
    },
    '33,9': {
      name: 'PP SPEECH HOUSE', kind: 'page', title: 'TEACHING',
      body: [
        'Casper once taught MBO Level 4 ICT students at ROC van Amsterdam during a teacher shortage.',
        'Lesson plans, hands-on labs and mentoring students through practical projects.',
      ],
    },
    '19,1': {
      name: 'ROUTE 35 GATE', kind: 'page', title: 'LEAVING TOWN?',
      body: ['Prefer a plain web page? The classic portfolio has everything on one page.'],
      links: [{ label: 'CLASSIC SITE', href: 'classic.html' }],
    },
    '9,5': {
      name: 'UNDERGROUND', kind: 'page', title: 'UNDERGROUND',
      body: ['This town is built from the original POKéMON Crystal map data. The source is on GitHub.'],
      links: [{ label: 'VIEW THE SOURCE', href: 'https://github.com/FaiGiJoon/FaiGiJoon.github.io' }],
    },
    '11,29': {
      name: 'UNDERGROUND', kind: 'page', title: 'UNDERGROUND',
      body: ['Prefer a plain web page? The classic portfolio has everything on one page.'],
      links: [{ label: 'CLASSIC SITE', href: 'classic.html' }],
    },
  },

  signs: {
    '10,14': 'MAGNET TRAIN STATION. Every stop of Casper\'s career.',
    '4,17': 'RADIO TOWER. Get in touch with Casper!',
    '26,27': 'GOLDENROD DEPT. STORE. Skills & tools on every floor.',
    '26,9': 'GOLDENROD CITY POKéMON GYM. LEADER: RED. The silent champion.',
    '22,18': "GOLDENROD CITY. Casper Klootwijk's portfolio town. System Support Engineer.",
    '28,30': 'BIKE SHOP. What Casper does outside of work.',
    '16,22': 'GAME CORNER. Projects, live from GitHub!',
    '12,7': "NAME RATER. Casper's CV is kept here.",
    '8,6': 'UNDERGROUND ENTRANCE. Behind the scenes of this town.',
    '12,30': 'UNDERGROUND ENTRANCE. The classic portfolio page.',
    '16,27': 'POKéMON CENTER. All about Casper.',
    '30,6': 'FLOWER SHOP. The blog blooms here.',
  },

  npcs: [
    { x: 7, y: 18, sprite: 'POKEFAN_M', facing: 'up',
      text: 'The RADIO TOWER broadcasts how to reach Casper. Email works best!' },
    { x: 30, y: 17, sprite: 'YOUNGSTER', wander: [1, 1],
      text: "Casper got into computers through POKéMON PLATINUM. BILL's house down south-west has the story." },
    { x: 12, y: 16, sprite: 'COOLTRAINER_F', facing: 'left', palette: 2,
      text: 'Casper is a System Support Engineer at AXIS, setting up MikroTik network gear over SSH.' },
    { x: 20, y: 26, sprite: 'COOLTRAINER_F', wander: [1, 2],
      text: 'At PROSUS, Casper helped the whole company move from Microsoft 365 to Google Workspace!' },
    { x: 19, y: 17, sprite: 'YOUNGSTER', wander: [1, 1], palette: 0,
      text: "Ride the MAGNET TRAIN to the west to see every stop of Casper's career." },
    { x: 17, y: 10, sprite: 'LASS', wander: [2, 0], palette: 2,
      text: "This GYM's leader isn't WHITNEY anymore... It's RED! Every POKéMON is Lv60." },
    { x: 11, y: 27, sprite: 'GRAMPS', wander: [1, 0],
      text: 'Back in my day, Casper taught networks and cybersecurity at ROC van Amsterdam.' },
    { x: 4, y: 16, sprite: 'ROCKET', facing: 'up',
      text: "TEAM ROCKET wants Casper's CV... The NAME RATER has it. Don't tell anyone!" },
    { x: 12, y: 22, sprite: 'POKEFAN_M', facing: 'down', palette: 0,
      text: 'The GAME CORNER shows the newest projects on GitHub. No coins needed!' },
    { x: 23, y: 8, sprite: 'GYM_GUIDE', facing: 'down',
      text: 'Yo! Champ in the making! RED is inside. Step through the door if you dare!' },
  ],
};
