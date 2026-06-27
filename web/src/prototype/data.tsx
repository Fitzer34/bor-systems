// @ts-nocheck
/* Ported verbatim from claude.ai/design prototype (asset_03) — sample operations data. */
/* HazardLink prototype — sample operations data */
export const HL = (function () {

  const sites = [
    { id: "s1", name: "Riverside Retail Park",    loc: "Cork",      status: "ok",   open: 6 },
    { id: "s2", name: "Northgate Logistics Hub",   loc: "Dublin",    status: "warn", open: 9 },
    { id: "s3", name: "Aviva Office Tower",         loc: "Dublin",    status: "ok",   open: 5 },
    { id: "s4", name: "Lee Valley Medical Centre",  loc: "Limerick",  status: "ok",   open: 2 },
    { id: "s5", name: "Tramore Leisure Centre",     loc: "Waterford", status: "warn", open: 1 },
    { id: "s6", name: "Galway City Library",         loc: "Galway",    status: "ok",   open: 1 },
  ];

  const kpis = [
    { id: "k1", label: "Open work orders", value: "23",  icon: "wrench",      tone: "maint",  trend: "-12%",  up: true,  foot: "vs. last week" },
    { id: "k2", label: "PM compliance",    value: "94",  unit: "%", icon: "checkCircle", tone: "ok",    trend: "+3%",   up: true,  foot: "planned jobs on time" },
    { id: "k3", label: "Avg. MTTR",        value: "1.8", unit: "d", icon: "clock",   tone: "accent", trend: "-0.4d", up: true,  foot: "mean time to repair" },
    { id: "k4", label: "Patrols on time",  value: "98",  unit: "%", icon: "shield",  tone: "secure", trend: "+1%",   up: true,  foot: "across all sites" },
  ];

  const feed = [
    { id:"f1", disc:"clean",  sev:"crit", live:true,  title:"Wet-floor spill detected — Aisle 4",         site:"Riverside Retail Park",    detail:"Cleaner auto-dispatched · IoT sign sensor", time:"now",
      panel:{ type:"Reactive spill", action:"Cleaner dispatched within 4 min. IoT sensor confirmed wet floor. Smart sign activated automatically." }},
    { id:"f2", disc:"maint",  sev:"warn",             title:"Water leak reported — Unit 4 cold store",     site:"Northgate Logistics Hub",  detail:"Logged by guard on patrol", time:"12m", wo:"WO-2041",
      panel:{ type:"Fault logged", asset:"Cold store refrigeration unit", woStatus:"Tendering — 3 quotes in", action:"Tap View work order to see the full lifecycle, scope and ranked quotes." }},
    { id:"f3", disc:"secure", sev:"warn",             title:"Lone-worker check-in overdue",                site:"Aviva Office Tower",       detail:"Night guard · auto follow-up sent", time:"18m",
      panel:{ type:"Lone worker", worker:"Aoibhe Nolan", role:"Security guard", lastSeen:"Level 2 checkpoint, 23 min ago", action:"Auto follow-up sent. No response yet. Escalation triggered in 7 min." }},
    { id:"f4", disc:"secure", sev:"crit",             title:"Incident reported — slip near entrance",      site:"Tramore Leisure Centre",   detail:"Severity: medium · 2 photos attached", time:"46m",
      panel:{ type:"Incident — slip and fall", reporter:"Michael Cronin", severity:"Medium", action:"Reported on mobile with 2 photos. Incident log opened. Awaiting site manager acknowledgement." }},
    { id:"f5", disc:"clean",  sev:"ok",               title:"Inspection passed — Reception (98%)",         site:"Aviva Office Tower",       detail:"Mobile inspection · 6 photos", time:"1h",
      panel:{ type:"Inspection complete", score:98, areas:8, action:"All 8 areas passed. 6 photos attached. PDF report ready to share with client." }},
    { id:"f6", disc:"maint",  sev:"muted",            title:"PPM due — Fire alarm panel",                  site:"Lee Valley Medical Centre",detail:"Planned preventive maintenance", time:"1h", wo:"WO-2031",
      panel:{ type:"Planned PM", asset:"Fire alarm panel", woStatus:"Scheduled with FireSafe Ltd", action:"Tap View work order to confirm attendance and upload the service certificate." }},
    { id:"f7", disc:"clean",  sev:"ok",               title:"SDS verified — Floor degreaser",              site:"Riverside Retail Park",    detail:"Safety data sheet · AI-extracted, person-checked", time:"2h",
      panel:{ type:"SDS verified", product:"Industrial floor degreaser", verifier:"Aoife Kelly", action:"Sheet is now live and available to field teams on mobile." }},
    { id:"f8", disc:"secure", sev:"muted",            title:"Checkpoint scanned — Loading bay",            site:"Northgate Logistics Hub",  detail:"Guard tour · NFC checkpoint", time:"2h",
      panel:{ type:"Guard checkpoint", guard:"Liam Doyle", checkpoint:"Loading bay NFC tag", tour:"Patrol P-014, on schedule" }},
    { id:"f9", disc:"maint",  sev:"ok",               title:"Work order closed — HVAC filter swap",        site:"Aviva Office Tower",       detail:"Costed at €85 · contractor signed off", time:"3h", wo:"WO-2025",
      panel:{ type:"Job complete", asset:"Rooftop HVAC unit 2", cost:"€85", contractor:"Citywide Facilities", action:"Work verified and closed. Asset service record updated." }},
  ];

  const disciplines = [
    { id:"clean",  name:"Cleaning",    desc:"Rounds · spills · inspections", icon:"droplet", stats:[
      { n:"18/22", l:"rounds done" }, { n:"1", l:"spill active" }, { n:"96%", l:"avg score" }]},
    { id:"maint",  name:"Maintenance", desc:"CMMS · assets · contractors",   icon:"wrench",  stats:[
      { n:"23", l:"open jobs" }, { n:"4", l:"PMs due" }, { n:"1.8d", l:"avg MTTR" }]},
    { id:"secure", name:"Security",    desc:"Patrols · incidents · lone-worker", icon:"shield", stats:[
      { n:"12/12", l:"patrols" }, { n:"2", l:"incidents" }, { n:"8", l:"lone-workers" }]},
  ];

  const workOrders = [
    { id:"WO-2041", title:"Water leak in Unit 4 cold store",        asset:"Cold store refrigeration unit", site:"Northgate Logistics Hub",   priority:"High",   status:"In progress", statusTone:"accent", assignee:"AquaFix Plumbing",   initials:"AF", source:"Guard patrol" },
    { id:"WO-2038", title:"Rooftop HVAC unit 3 not cooling",         asset:"Rooftop HVAC unit 3",          site:"Aviva Office Tower",         priority:"Medium", status:"Tendering",   statusTone:"warn",   assignee:"3 quotes in",         initials:"··", source:"Inspection" },
    { id:"WO-2036", title:"Loading bay door sensor fault",           asset:"Loading bay door 2",           site:"Northgate Logistics Hub",   priority:"Medium", status:"Open",         statusTone:"muted",  assignee:"Unassigned",          initials:"—",  source:"Cleaner" },
    { id:"WO-2034", title:"Replace cracked floor tile — Aisle 7",   asset:"Floor, sales area",            site:"Riverside Retail Park",     priority:"Low",    status:"In progress", statusTone:"accent", assignee:"S. Byrne",             initials:"SB", source:"Inspection" },
    { id:"WO-2031", title:"Fire alarm panel — quarterly PPM",        asset:"Fire alarm panel",             site:"Lee Valley Medical Centre", priority:"Medium", status:"Scheduled",   statusTone:"secure", assignee:"FireSafe Ltd",         initials:"FS", source:"PPM" },
    { id:"WO-2029", title:"Car-park light out — bay 12",             asset:"External lighting",            site:"Tramore Leisure Centre",    priority:"Low",    status:"Open",         statusTone:"muted",  assignee:"Unassigned",          initials:"—",  source:"Guard patrol" },
    { id:"WO-2025", title:"HVAC filter swap — unit 2",               asset:"Rooftop HVAC unit 2",          site:"Aviva Office Tower",         priority:"Low",    status:"Done",         statusTone:"ok",     assignee:"Citywide Facilities",  initials:"CF", source:"PPM" },
    { id:"WO-2021", title:"Replace ceiling tile — entrance",         asset:"Ceiling, entrance",            site:"Riverside Retail Park",     priority:"Low",    status:"Done",         statusTone:"ok",     assignee:"S. Byrne",             initials:"SB", source:"Manager" },
    { id:"WO-2043", title:"Self-check kiosk 3 — intermittent power",  asset:"Self-check kiosk 3",           site:"Galway City Library",        priority:"Medium", status:"Open",         statusTone:"muted",  assignee:"Unassigned",          initials:"—",  source:"Librarian" },
  ];

  const woDetail = {
    id:"WO-2041", title:"Water leak in Unit 4 cold store",
    site:"Northgate Logistics Hub, Dublin", priority:"High",
    desc:"Standing water pooling under the cold-store door. Suspected condensate drain blockage or split drain line. Slip risk in a high-traffic aisle — flagged for same-day attendance.",
    asset:{ id:"AST-0142", name:"Cold store refrigeration unit", make:"Daikin ZEAS, installed 2021", health:62 },
    reporter:{ name:"Liam Doyle", role:"Security", initials:"LD" },
    sla:"Same-day, 4h 12m left",
    steps:[
      { state:"done",   title:"Reported on patrol",      by:"Liam Doyle (Security) spotted standing water during the 14:20 guard tour and logged it from the app with 2 photos.", time:"14:22" },
      { state:"done",   title:"Triaged with AI",          by:"Matched to asset AST-0142, priority set to High, and a scope of works drafted from asset history.", time:"14:25" },
      { state:"done",   title:"White-label tender sent",  by:"Tender emailed to 3 approved drainage contractors. No login needed, they quote from the browser.", time:"14:40" },
      { state:"active", title:"Quotes ranked on value",   by:"3 quotes received. Ranked on price, lead time and contractor rating.", time:"15:08" },
      { state:"todo",   title:"Assign and schedule" },
      { state:"todo",   title:"Fixed and logged" },
    ],
    quotes:[
      { name:"AquaFix Plumbing and Drainage", note:"Can attend today, rated 4.8", price:"€420", best:true, bars:[{l:"Price",v:74},{l:"Lead time",v:95},{l:"Rating",v:96}], value:92 },
      { name:"Murphy Mechanical",              note:"3-day lead, rated 4.5",       price:"€380", bars:[{l:"Price",v:88},{l:"Lead time",v:45},{l:"Rating",v:90}], value:78 },
      { name:"Citywide Facilities",            note:"Next-day, rated 4.1",         price:"€510", bars:[{l:"Price",v:58},{l:"Lead time",v:70},{l:"Rating",v:82}], value:64 },
    ],
    scope:"Attend Unit 4 cold store at Northgate Logistics Hub. Clear and flush the condensate drain line serving the refrigeration unit (AST-0142); inspect for a split or disconnected section and replace as needed. Confirm free drainage, dry the affected floor area and remove the slip hazard. Photograph before and after for the work-order record.",
    scopeBullets:[
      "Asset under warranty until 03/2027 — log any parts against the warranty.",
      "Last serviced 11 weeks ago; condensate line not on the current PPM.",
      "High-traffic aisle — coordinate access with the site cleaning round.",
    ],
  };

  const assets = [
    { id:"AST-0142", name:"Cold store refrigeration unit", icon:"box",     site:"Northgate Logistics Hub",    health:62, htone:"warn", last:"11 weeks ago" },
    { id:"AST-0098", name:"Rooftop HVAC unit 3",           icon:"wrench",  site:"Aviva Office Tower",          health:38, htone:"crit", last:"6 months ago" },
    { id:"AST-0203", name:"Fire alarm panel",               icon:"shield",  site:"Lee Valley Medical Centre",  health:95, htone:"ok",   last:"2 weeks ago" },
    { id:"AST-0077", name:"Passenger lift A",               icon:"box",     site:"Aviva Office Tower",          health:88, htone:"ok",   last:"5 weeks ago" },
    { id:"AST-0154", name:"Loading bay door 2",             icon:"box",     site:"Northgate Logistics Hub",    health:71, htone:"warn", last:"8 weeks ago" },
    { id:"AST-0188", name:"Pool filtration pump",           icon:"droplet", site:"Tramore Leisure Centre",     health:80, htone:"ok",   last:"3 weeks ago" },
    { id:"AST-0061", name:"Heating circuit, 2nd floor",     icon:"wrench",  site:"Aviva Office Tower",          health:75, htone:"warn", last:"14 weeks ago" },
    { id:"AST-0210", name:"Automatic door, main entrance",  icon:"box",     site:"Riverside Retail Park",      health:91, htone:"ok",   last:"6 weeks ago" },
    { id:"AST-0231", name:"Self-check kiosk 3",                 icon:"monitor", site:"Galway City Library",        health:78, htone:"ok",   last:"4 weeks ago" },
  ];

  const sds = [
    { id:"SDS-041", name:"Industrial floor degreaser",    supplier:"Diversey",         disc:"clean", hazard:"Irritant",      status:"Verified",       stone:"ok",   date:"verified 2h ago" },
    { id:"SDS-038", name:"Chlorine sanitiser tablets",    supplier:"Ecolab",            disc:"clean", hazard:"Corrosive",     status:"Verified",       stone:"ok",   date:"verified yesterday" },
    { id:"SDS-035", name:"Refrigerant R-32",              supplier:"Daikin",            disc:"maint", hazard:"Flammable gas", status:"Verified",       stone:"ok",   date:"verified 3 days ago" },
    { id:"SDS-033", name:"Penetrating lubricant spray",   supplier:"WD-40",             disc:"maint", hazard:"Flammable",     status:"Awaiting check", stone:"warn", date:"AI-extracted, needs a person" },
    { id:"SDS-029", name:"Graffiti remover gel",          supplier:"Evans Vanodine",    disc:"clean", hazard:"Irritant",      status:"Verified",       stone:"ok",   date:"verified last week" },
    { id:"SDS-027", name:"Drain cleaning granules",       supplier:"HG",                disc:"maint", hazard:"Corrosive",     status:"Verified",       stone:"ok",   date:"verified 2 weeks ago" },
    { id:"SDS-024", name:"Foaming glass cleaner",         supplier:"Jangro",            disc:"clean", hazard:"Flammable",     status:"Awaiting check", stone:"warn", date:"AI-extracted, needs a person" },
    { id:"SDS-021", name:"Descaler concentrate",          supplier:"Kilrock",           disc:"clean", hazard:"Irritant",      status:"Verified",       stone:"ok",   date:"verified last month" },
  ];

  const rounds = [
    { id:"r1", site:"Riverside Retail Park",    type:"Daily clean",     due:"07:00", done:"07:52", status:"done",        score:94, cleaner:"Patricia Ryan",  initials:"PR" },
    { id:"r2", site:"Northgate Logistics Hub",  type:"Daily clean",     due:"08:00", done:null,    status:"in-progress", score:null, cleaner:"Owen Farrell", initials:"OF" },
    { id:"r3", site:"Aviva Office Tower",        type:"Deep clean",      due:"06:00", done:"09:15", status:"done",        score:88, cleaner:"Siobhan Walsh",  initials:"SW" },
    { id:"r4", site:"Lee Valley Medical Centre", type:"Daily clean",    due:"07:30", done:null,    status:"pending",     score:null, cleaner:"Declan Moore",  initials:"DM" },
    { id:"r5", site:"Tramore Leisure Centre",    type:"Daily clean",     due:"09:00", done:null,    status:"pending",     score:null, cleaner:"Niamh Delaney",initials:"ND" },
    { id:"r6", site:"Riverside Retail Park",    type:"Reactive spill",  due:"14:31", done:null,    status:"in-progress", score:null, cleaner:"Patricia Ryan",  initials:"PR" },
    { id:"r7", site:"Galway City Library",       type:"Daily clean",     due:"08:00", done:null,    status:"pending",     score:null, cleaner:"Mairéad Joyce",   initials:"MJ" },
  ];

  const inspectionAreas = [
    { id:"ia1", name:"Entrance lobby",            note:"Floors, mats, door glass and reception desk" },
    { id:"ia2", name:"Public washrooms",           note:"Sinks, mirrors, floors, bins and consumable stock" },
    { id:"ia3", name:"Staff kitchen",              note:"Surfaces, appliances, sink and floor" },
    { id:"ia4", name:"Open-plan office",           note:"Desks, screens, floors and bins" },
    { id:"ia5", name:"Meeting rooms",              note:"Tables, chairs, whiteboards and glass partitions" },
    { id:"ia6", name:"Corridors and common areas", note:"Floors, skirting, noticeboards and signage" },
    { id:"ia7", name:"Stairwells",                 note:"Treads, handrails and landings" },
    { id:"ia8", name:"External areas",             note:"Entrance path, car-park and bin store" },
  ];

  const incidents = [
    { id:"INC-0034", type:"Slip and fall",         sev:"medium", sevTone:"warn",   site:"Tramore Leisure Centre",   time:"46 min ago",  status:"Open",     statusTone:"warn",   reporter:"Michael Cronin", role:"Security",
      desc:"A visitor slipped near the main entrance on a wet floor. The area was temporarily closed off. No serious injury reported but the visitor was attended to. Two photos taken at the scene.",
      steps:[
        { state:"done",   title:"Reported",            by:"Michael Cronin logged the incident on mobile with 2 photos", time:"14:31" },
        { state:"active", title:"Under review",         by:"Awaiting site manager acknowledgement and corrective action", time:"14:35" },
        { state:"todo",   title:"Corrective action" },
        { state:"todo",   title:"Closed" },
      ]},
    { id:"INC-0033", type:"Lone-worker overdue",    sev:"low",    sevTone:"accent", site:"Aviva Office Tower",       time:"18 min ago",  status:"Resolved", statusTone:"ok",     reporter:"System",         role:"Auto-trigger",
      desc:"Auto-generated alert after Aoibhe Nolan missed her scheduled check-in by 15 minutes. A follow-up notification was sent and she responded within 3 minutes confirming she was safe.",
      steps:[
        { state:"done", title:"Alert triggered",     by:"Check-in 15 min overdue, auto follow-up sent", time:"13:42" },
        { state:"done", title:"Worker responded",    by:"Aoibhe Nolan confirmed safe via mobile within 3 min", time:"13:45" },
        { state:"done", title:"Resolved",            by:"Logged and closed automatically", time:"13:45" },
      ]},
    { id:"INC-0031", type:"Suspicious person",      sev:"low",    sevTone:"accent", site:"Northgate Logistics Hub",  time:"3 hours ago", status:"Resolved", statusTone:"ok",     reporter:"Liam Doyle",     role:"Security guard",
      desc:"Individual without a valid site pass observed near loading bay 2. Guard approached and escorted the person to reception. Visitor log updated.",
      steps:[
        { state:"done", title:"Spotted on patrol",  by:"Liam Doyle spotted individual near loading bay 2", time:"11:10" },
        { state:"done", title:"Escorted to reception", by:"Visitor processed and issued with a day pass", time:"11:14" },
        { state:"done", title:"Resolved",            time:"11:15" },
      ]},
    { id:"INC-0029", type:"Near miss",              sev:"medium", sevTone:"warn",   site:"Riverside Retail Park",    time:"Yesterday",   status:"Closed",   statusTone:"muted",  reporter:"Patricia Ryan",  role:"Cleaner",
      desc:"A forklift nearly struck a pedestrian in the goods-in area. Both parties were not harmed. The incident was reviewed and a floor-marking update was scheduled.",
      steps:[
        { state:"done", title:"Reported",            by:"Patricia Ryan submitted incident report", time:"Wed 09:15" },
        { state:"done", title:"Investigation",       by:"CCTV reviewed. Root cause: missing pedestrian zone markings", time:"Wed 11:30" },
        { state:"done", title:"Corrective action",   by:"Floor-marking work order raised and completed in 2 days", time:"Fri 14:00" },
        { state:"done", title:"Closed",              time:"Fri 14:10" },
      ]},
  ];

  const patrols = [
    { id:"p1", guard:"Liam Doyle",     initials:"LD", site:"Northgate Logistics Hub",  started:"14:00", status:"in-progress",
      checkpoints:[
        { id:"cp1", name:"Main gate",          scanned:true,  time:"14:02" },
        { id:"cp2", name:"Loading bay 1",      scanned:true,  time:"14:08" },
        { id:"cp3", name:"Loading bay 2",      scanned:true,  time:"14:14" },
        { id:"cp4", name:"Cold store corridor",scanned:true,  time:"14:21" },
        { id:"cp5", name:"Staff canteen",      scanned:false, time:null },
        { id:"cp6", name:"Roof access",        scanned:false, time:null },
        { id:"cp7", name:"Perimeter east",     scanned:false, time:null },
      ]},
    { id:"p2", guard:"Aoibhe Nolan",   initials:"AN", site:"Aviva Office Tower",        started:"13:00", status:"complete",
      checkpoints:[
        { id:"cp8",  name:"Ground-floor lobby", scanned:true, time:"13:01" },
        { id:"cp9",  name:"Level 2 corridor",   scanned:true, time:"13:07" },
        { id:"cp10", name:"Level 4 corridor",   scanned:true, time:"13:14" },
        { id:"cp11", name:"Server room door",   scanned:true, time:"13:18" },
        { id:"cp12", name:"Roof terrace",        scanned:true, time:"13:23" },
        { id:"cp13", name:"Car park east",       scanned:true, time:"13:28" },
      ]},
    { id:"p3", guard:"Michael Cronin", initials:"MC", site:"Tramore Leisure Centre",    started:"09:30", status:"complete",
      checkpoints:[
        { id:"cp14", name:"Main entrance", scanned:true, time:"09:31" },
        { id:"cp15", name:"Pool area",     scanned:true, time:"09:38" },
        { id:"cp16", name:"Changing rooms",scanned:true, time:"09:43" },
        { id:"cp17", name:"Plant room",    scanned:true, time:"09:48" },
        { id:"cp18", name:"Car park",      scanned:true, time:"09:53" },
      ]},
  ];

  const loneWorkers = [
    { id:"lw1", name:"Patricia Ryan",  role:"Cleaner",        site:"Riverside Retail Park",    initials:"PR", lastCheckin:"23 min ago", status:"ok" },
    { id:"lw2", name:"Owen Farrell",   role:"Cleaner",        site:"Northgate Logistics Hub",  initials:"OF", lastCheckin:"11 min ago", status:"ok" },
    { id:"lw3", name:"Siobhan Walsh",  role:"Cleaner",        site:"Aviva Office Tower",        initials:"SW", lastCheckin:"41 min ago", status:"ok" },
    { id:"lw4", name:"Liam Doyle",     role:"Security guard", site:"Northgate Logistics Hub",  initials:"LD", lastCheckin:"6 min ago",  status:"ok" },
    { id:"lw5", name:"Aoibhe Nolan",   role:"Security guard", site:"Aviva Office Tower",        initials:"AN", lastCheckin:"2 min ago",  status:"ok" },
    { id:"lw6", name:"Michael Cronin", role:"Security guard", site:"Tramore Leisure Centre",   initials:"MC", lastCheckin:"18 min ago", status:"ok" },
    { id:"lw7", name:"Declan Moore",   role:"Cleaner",        site:"Lee Valley Medical Centre",initials:"DM", lastCheckin:"52 min ago", status:"overdue" },
    { id:"lw8", name:"Niamh Delaney",  role:"Cleaner",        site:"Tramore Leisure Centre",   initials:"ND", lastCheckin:"8 min ago",  status:"ok" },
  ];

  const sdsExtraction = {
    barcode:"8710908030390", product:"Industrial floor degreaser",
    supplier:"Diversey (Ireland)", productCode:"7519637",
    hazards:"H315 (skin irritant), H319 (eye irritant), H335 (may cause respiratory irritation)",
    ppe:"Nitrile gloves (EN374), safety glasses or goggles",
    firstAidSkin:"Remove contaminated clothing. Wash skin with soap and water for at least 15 minutes.",
    firstAidEyes:"Rinse cautiously with water for several minutes. Remove contact lenses if easy to do. If irritation persists, seek medical advice.",
    firstAidIngestion:"Do not induce vomiting. Rinse mouth with water. Seek medical advice immediately.",
    storage:"Store in a cool, dry, well-ventilated area. Keep container tightly closed. Store away from oxidising agents.",
    disposal:"Dispose of contents and container in accordance with local regulations.",
    dilution:"1:20 with water for general floor cleaning. Use neat for heavy grease.",
  };

  const reportData = {
    summary:[
      { n:"94%", l:"PM compliance" }, { n:"1.8d", l:"Avg. MTTR" }, { n:"91%", l:"Avg. clean score" }, { n:"10", l:"Incidents this month" },
    ],
    pmCompliance:[
      { l:"Riverside",  v:96 }, { l:"Northgate", v:88 }, { l:"Aviva", v:94 }, { l:"Lee Valley", v:100 }, { l:"Tramore", v:82 },
    ],
    mttr:[
      { l:"Jan", v:2.4 }, { l:"Feb", v:2.1 }, { l:"Mar", v:1.9 }, { l:"Apr", v:2.3 }, { l:"May", v:1.8 }, { l:"Jun", v:1.8 },
    ],
    cleanScores:[
      { l:"Riverside",  v:94 }, { l:"Northgate", v:87 }, { l:"Aviva", v:91 }, { l:"Lee Valley", v:96 }, { l:"Tramore", v:88 },
    ],
    incidentsByType:[
      { l:"Near miss", v:4 }, { l:"Slip / fall", v:3 }, { l:"Lone worker", v:2 }, { l:"Security breach", v:1 },
    ],
  };

  /* ===========================================================
     Contractor compliance — companies, staff, certs, reminders
     =========================================================== */
  const contractors = [
    {
      id:"c1", name:"AquaFix Plumbing and Drainage", type:"Drainage and plumbing",
      location:"Tallaght, Dublin 24", contact:"Mary O'Sullivan", email:"mary@aquafix.ie",
      phone:"+353 1 555 0143", cro:"478123", insurance:"AXA · €6.5m public liability",
      status:"compliant", lastRefresh:"2 weeks ago", pendingUpload:false, initials:"AF",
      staff:[
        { id:"p1", name:"Liam McCarthy", role:"Lead drainage engineer", initials:"LM",
          certs:[
            { name:"SafePass",                  issued:"12 Mar 2023", expires:"12 Mar 2027", status:"valid" },
            { name:"Manual Handling",            issued:"04 Jan 2024", expires:"04 Jan 2027", status:"valid" },
            { name:"Public Liability Insurance", issued:"01 Apr 2025", expires:"01 Apr 2027", status:"valid" },
            { name:"RAMS",                       issued:"15 Feb 2026", expires:"15 Feb 2027", status:"valid" },
          ]},
        { id:"p2", name:"Áine Hennessy", role:"Drainage engineer", initials:"AH",
          certs:[
            { name:"SafePass",                  issued:"22 May 2024", expires:"22 May 2028", status:"valid" },
            { name:"Manual Handling",            issued:"08 Aug 2024", expires:"08 Aug 2027", status:"valid" },
            { name:"Public Liability Insurance", issued:"01 Apr 2025", expires:"01 Apr 2027", status:"valid" },
            { name:"RAMS",                       issued:"15 Feb 2026", expires:"15 Feb 2027", status:"valid" },
          ]},
        { id:"p3", name:"Eoin Brennan", role:"Apprentice", initials:"EB",
          certs:[
            { name:"SafePass",                  issued:"09 Sep 2025", expires:"09 Sep 2029", status:"valid" },
            { name:"Manual Handling",            issued:"09 Sep 2025", expires:"09 Sep 2028", status:"valid" },
            { name:"Public Liability Insurance", issued:"01 Apr 2025", expires:"01 Apr 2027", status:"valid" },
            { name:"RAMS",                       issued:"15 Feb 2026", expires:"15 Feb 2027", status:"valid" },
          ]},
      ],
    },
    {
      id:"c2", name:"Murphy Mechanical", type:"HVAC and mechanical",
      location:"Ballyfermot, Dublin 10", contact:"Padraig Murphy", email:"office@murphymech.ie",
      phone:"+353 1 555 0227", cro:"312984", insurance:"FBD · €6.5m public liability",
      status:"expiring", lastRefresh:"3 weeks ago", pendingUpload:false, initials:"MM",
      staff:[
        { id:"p4", name:"Padraig Murphy", role:"Owner · senior engineer", initials:"PM",
          certs:[
            { name:"SafePass",                  issued:"30 Jun 2022", expires:"30 Jun 2026", status:"expiring", inDays:11 },
            { name:"Manual Handling",            issued:"12 Feb 2024", expires:"12 Feb 2027", status:"valid" },
            { name:"Public Liability Insurance", issued:"05 May 2025", expires:"05 May 2027", status:"valid" },
            { name:"RAMS",                       issued:"04 Mar 2026", expires:"04 Mar 2027", status:"valid" },
          ]},
        { id:"p5", name:"Seán Kavanagh", role:"HVAC engineer", initials:"SK",
          certs:[
            { name:"SafePass",                  issued:"14 Aug 2023", expires:"14 Aug 2027", status:"valid" },
            { name:"Manual Handling",            issued:"02 Oct 2023", expires:"02 Oct 2026", status:"expiring", inDays:108 },
            { name:"Public Liability Insurance", issued:"05 May 2025", expires:"05 May 2027", status:"valid" },
            { name:"RAMS",                       issued:"04 Mar 2026", expires:"04 Mar 2027", status:"valid" },
          ]},
        { id:"p6", name:"Róisín Daly", role:"Refrigeration technician", initials:"RD",
          certs:[
            { name:"SafePass",                  issued:"19 Jan 2024", expires:"19 Jan 2028", status:"valid" },
            { name:"Manual Handling",            issued:"19 Jan 2024", expires:"19 Jan 2027", status:"valid" },
            { name:"Public Liability Insurance", issued:"05 May 2025", expires:"05 May 2027", status:"valid" },
            { name:"RAMS",                       issued:"04 Mar 2026", expires:"04 Mar 2027", status:"valid" },
          ]},
      ],
    },
    {
      id:"c3", name:"Citywide Facilities", type:"General maintenance",
      location:"Finglas, Dublin 11", contact:"Niamh Brennan", email:"compliance@citywidefm.ie",
      phone:"+353 1 555 0398", cro:"567112", insurance:"Zurich · €6.5m public liability",
      status:"blocked", lastRefresh:"8 weeks ago", pendingUpload:false, initials:"CF",
      blockedSummary:"Tom Healy's SafePass and the team's RAMS are past expiry, and the public liability cover renewed in April has not been re-uploaded.",
      remindedAt:"emailed Niamh Brennan this morning at 09:14",
      staff:[
        { id:"p7", name:"Tom Healy", role:"Multi-skill technician", initials:"TH",
          certs:[
            { name:"SafePass",                  issued:"01 Apr 2022", expires:"01 Apr 2026", status:"expired" },
            { name:"Manual Handling",            issued:"19 Sep 2023", expires:"19 Sep 2026", status:"valid" },
            { name:"Public Liability Insurance", issued:"15 Apr 2024", expires:"15 Apr 2026", status:"expired" },
            { name:"RAMS",                       issued:"10 Jan 2025", expires:"10 Jan 2026", status:"expired" },
          ]},
        { id:"p8", name:"Joseph Igwe", role:"Multi-skill technician", initials:"JI",
          certs:[
            { name:"SafePass",                  issued:"22 Jun 2023", expires:"22 Jun 2027", status:"valid" },
            { name:"Manual Handling",            issued:"07 Nov 2024", expires:"07 Nov 2027", status:"valid" },
            { name:"Public Liability Insurance", issued:"15 Apr 2024", expires:"15 Apr 2026", status:"expired" },
            { name:"RAMS",                       issued:"10 Jan 2025", expires:"10 Jan 2026", status:"expired" },
          ]},
        { id:"p9", name:"Cliona Ward", role:"Painter and decorator", initials:"CW",
          certs:[
            { name:"SafePass",                  issued:"16 May 2024", expires:"16 May 2028", status:"valid" },
            { name:"Manual Handling",            issued:"16 May 2024", expires:"16 May 2027", status:"valid" },
            { name:"Public Liability Insurance", issued:"15 Apr 2024", expires:"15 Apr 2026", status:"expired" },
            { name:"RAMS",                       issued:"10 Jan 2025", expires:"10 Jan 2026", status:"expired" },
          ]},
      ],
    },
    {
      id:"c4", name:"FireSafe Ltd", type:"Fire safety and life safety",
      location:"Carrigaline, Cork", contact:"Áine Quinn", email:"compliance@firesafe.ie",
      phone:"+353 21 555 0814", cro:"219045", insurance:"Allianz · €6.5m public liability",
      status:"expiring", lastRefresh:"6 weeks ago", pendingUpload:true, pendingSince:"2 days ago", initials:"FS",
      staff:[
        { id:"p10", name:"Áine Quinn", role:"Senior fire engineer", initials:"AQ",
          certs:[
            { name:"SafePass",                  issued:"11 Jun 2022", expires:"11 Jun 2026", status:"expiring", inDays:-7 },
            { name:"Manual Handling",            issued:"03 Mar 2024", expires:"03 Mar 2027", status:"valid" },
            { name:"Public Liability Insurance", issued:"18 Feb 2025", expires:"18 Feb 2027", status:"valid" },
            { name:"RAMS",                       issued:"22 Feb 2026", expires:"22 Feb 2027", status:"valid" },
          ]},
        { id:"p11", name:"Eamon Walsh", role:"Fire engineer", initials:"EW",
          certs:[
            { name:"SafePass",                  issued:"19 Aug 2023", expires:"19 Aug 2027", status:"valid" },
            { name:"Manual Handling",            issued:"03 Mar 2024", expires:"03 Mar 2027", status:"valid" },
            { name:"Public Liability Insurance", issued:"18 Feb 2025", expires:"18 Feb 2027", status:"valid" },
            { name:"RAMS",                       issued:"22 Feb 2026", expires:"22 Feb 2027", status:"valid" },
          ]},
      ],
    },
    {
      id:"c5", name:"S. Byrne General Builders", type:"Carpentry and remedial",
      location:"Mallow, Co. Cork", contact:"Stephen Byrne", email:"stephen@sbyrne.ie",
      phone:"+353 22 555 0211", cro:"sole trader", insurance:"FBD · €6.5m public liability",
      status:"compliant", lastRefresh:"5 days ago", pendingUpload:false, initials:"SB",
      staff:[
        { id:"p12", name:"Stephen Byrne", role:"Owner · carpenter", initials:"SB",
          certs:[
            { name:"SafePass",                  issued:"01 Jun 2024", expires:"01 Jun 2028", status:"valid" },
            { name:"Manual Handling",            issued:"01 Jun 2024", expires:"01 Jun 2027", status:"valid" },
            { name:"Public Liability Insurance", issued:"01 Jun 2025", expires:"01 Jun 2027", status:"valid" },
            { name:"RAMS",                       issued:"01 Jun 2026", expires:"01 Jun 2027", status:"valid" },
          ]},
        { id:"p13", name:"Mark O'Connor", role:"Carpenter", initials:"MO",
          certs:[
            { name:"SafePass",                  issued:"14 Feb 2025", expires:"14 Feb 2029", status:"valid" },
            { name:"Manual Handling",            issued:"14 Feb 2025", expires:"14 Feb 2028", status:"valid" },
            { name:"Public Liability Insurance", issued:"01 Jun 2025", expires:"01 Jun 2027", status:"valid" },
            { name:"RAMS",                       issued:"01 Jun 2026", expires:"01 Jun 2027", status:"valid" },
          ]},
      ],
    },
  ];

  // Auto reminder activity log (newest first)
  const reminders = [
    { id:"r1", contractor:"Citywide Facilities",   whom:"Tom Healy",       cert:"SafePass",                       state:"expired",  days:0,   sentAt:"this morning, 09:14" },
    { id:"r2", contractor:"Citywide Facilities",   whom:"All staff",        cert:"RAMS",                            state:"expired",  days:0,   sentAt:"this morning, 09:14" },
    { id:"r3", contractor:"Murphy Mechanical",     whom:"Padraig Murphy",   cert:"SafePass",                       state:"expiring", days:11,  sentAt:"yesterday, 06:00" },
    { id:"r4", contractor:"FireSafe Ltd",          whom:"Áine Quinn",       cert:"SafePass",                       state:"expiring", days:3,   sentAt:"yesterday, 06:00" },
    { id:"r5", contractor:"Murphy Mechanical",     whom:"Seán Kavanagh",    cert:"Manual Handling",                state:"upcoming", days:108, sentAt:"Tue 06:00 — 90-day notice" },
  ];

  /* ===========================================================
     Maintenance module — overview metrics, parts, meters, PPM, own staff
     =========================================================== */
  const maintenanceMetrics = {
    pmCompliance: { v:94, trend:"+3%",   up:true,  foot:"planned jobs on time this month" },
    mttr:         { v:1.8, unit:"d", trend:"-0.4d", up:true, foot:"mean time to repair" },
    backlog:      { v:23,           trend:"-12%",  up:true,  foot:"open work orders, all sites" },
    plannedShare: { v:72, unit:"%", trend:"+4%",   up:true,  foot:"planned vs reactive split" },
    bySite: [
      { l:"Riverside",  v:96 }, { l:"Northgate", v:88 }, { l:"Aviva", v:94 },
      { l:"Lee Valley", v:100 }, { l:"Tramore",   v:82 },
    ],
    mttrMonths: [
      { l:"Jan", v:2.4 }, { l:"Feb", v:2.1 }, { l:"Mar", v:1.9 },
      { l:"Apr", v:2.3 }, { l:"May", v:1.8 }, { l:"Jun", v:1.8 },
    ],
    backlogPriority: [
      { l:"High",    v:4,  tone:"crit" },
      { l:"Medium",  v:11, tone:"warn" },
      { l:"Low",     v:8,  tone:"muted" },
    ],
    backlogAge: [
      { l:"Less than 7 days", v:14, tone:"ok" },
      { l:"7 to 14 days",     v:6,  tone:"warn" },
      { l:"Over 14 days",     v:3,  tone:"crit" },
    ],
    upcoming: [
      { id:"PPM-102", title:"Fire alarm panel — quarterly test", site:"Lee Valley Medical Centre", due:"in 4 days",   assignee:"FireSafe Ltd" },
      { id:"PPM-101", title:"Quarterly HVAC service",             site:"Aviva Office Tower",         due:"in 12 days",  assignee:"Murphy Mechanical" },
      { id:"PPM-104", title:"Pool plant chemical balance",         site:"Tramore Leisure Centre",    due:"tomorrow",    assignee:"Liam McCarthy" },
    ],
  };

  const parts = [
    { id:"P-1042", name:"V-belt — A85",                  code:"VB-A85",    category:"Belts",       site:"Central stores, Dublin",        onHand:14, min:10, max:30, status:"in-stock", supplier:"Buckley & Co",      price:"€18.40",  lastOrder:"3 weeks ago",            linkedAssets:["AST-0098","AST-0061"] },
    { id:"P-0987", name:"Pleated air filter, 600×600",   code:"PAF-600",   category:"Filters",     site:"Aviva Office Tower, plant rm",  onHand:2,  min:8,  max:24, status:"low",      supplier:"AHU Direct",        price:"€32.00",  lastOrder:"5 days ago, awaiting",   linkedAssets:["AST-0098","AST-0077"] },
    { id:"P-0654", name:"Condensate drain kit",          code:"CDK-32",    category:"Plumbing",    site:"Northgate Hub, workshop",        onHand:0,  min:2,  max:6,  status:"out",      supplier:"AquaFix Supplies", price:"€48.50",  lastOrder:"yesterday, PO 2031",     linkedAssets:["AST-0142"] },
    { id:"P-1119", name:"Refrigerant R-32 cylinder, 7kg", code:"R32-7KG",   category:"Refrigerant", site:"Central stores, Dublin",        onHand:5,  min:3,  max:8,  status:"in-stock", supplier:"Daikin Ireland",    price:"€132.00", lastOrder:"last month",             linkedAssets:["AST-0098","AST-0061"] },
    { id:"P-1234", name:"Fire alarm battery, 12V 7Ah",   code:"FAB-12V7",  category:"Batteries",   site:"Lee Valley, IT cupboard",        onHand:3,  min:4,  max:10, status:"low",      supplier:"FireSafe Ltd",      price:"€21.00",  lastOrder:"2 days ago, PO 2030",    linkedAssets:["AST-0203"] },
    { id:"P-0822", name:"Lift door safety edge",          code:"LDE-PASS",  category:"Lifts",       site:"Central stores, Dublin",        onHand:1,  min:1,  max:3,  status:"in-stock", supplier:"OTIS Service",      price:"€185.00", lastOrder:"6 months ago",           linkedAssets:["AST-0077"] },
    { id:"P-1450", name:"Auto-door motor brushes",        code:"ADM-BR",    category:"Auto doors",  site:"Central stores, Dublin",        onHand:6,  min:4,  max:10, status:"in-stock", supplier:"Record Doors",      price:"€14.20",  lastOrder:"2 months ago",           linkedAssets:["AST-0210"] },
    { id:"P-1633", name:"Drain rod set, 9 metre",        code:"DRS-9M",    category:"Plumbing",    site:"Northgate Hub, workshop",        onHand:2,  min:1,  max:3,  status:"in-stock", supplier:"Buckley & Co",      price:"€72.00",  lastOrder:"last year",              linkedAssets:["AST-0142"] },
    { id:"P-2011", name:"Pool plant chlorine tablets",   code:"CL-5KG",    category:"Pool",        site:"Tramore Leisure, plant rm",      onHand:8,  min:4,  max:12, status:"in-stock", supplier:"Aqualand Ireland", price:"€42.00",  lastOrder:"3 weeks ago",            linkedAssets:["AST-0188"] },
  ];

  const meters = [
    { id:"M-001", asset:"Rooftop HVAC unit 3",            assetId:"AST-0098", site:"Aviva Office Tower",          type:"Run hours",       reading:"14,820",  unit:"h",       lastRead:"3 days ago",  nextDue:"in 11 days",   frequency:"Monthly",    status:"on-schedule" },
    { id:"M-002", asset:"Cold store refrigeration unit", assetId:"AST-0142", site:"Northgate Logistics Hub",     type:"Run hours",       reading:"22,415",  unit:"h",       lastRead:"5 weeks ago", nextDue:"3 days overdue", frequency:"Monthly", status:"overdue" },
    { id:"M-003", asset:"Passenger lift A",                assetId:"AST-0077", site:"Aviva Office Tower",          type:"Cycle count",     reading:"38,440",  unit:"cycles",  lastRead:"1 week ago",  nextDue:"in 0 days",    frequency:"Weekly",     status:"due-soon" },
    { id:"M-004", asset:"Pool filtration pump",            assetId:"AST-0188", site:"Tramore Leisure Centre",      type:"Run hours",       reading:"9,712",   unit:"h",       lastRead:"2 weeks ago", nextDue:"in 2 weeks",   frequency:"Monthly",    status:"on-schedule" },
    { id:"M-005", asset:"Automatic door, main entrance",   assetId:"AST-0210", site:"Riverside Retail Park",       type:"Open/close cycles", reading:"412,300", unit:"cycles", lastRead:"yesterday",   nextDue:"in 13 days",   frequency:"Fortnightly", status:"on-schedule" },
    { id:"M-006", asset:"Fire alarm panel",                 assetId:"AST-0203", site:"Lee Valley Medical Centre",  type:"Self-test passes", reading:"1,420",  unit:"passes",  lastRead:"2 days ago",  nextDue:"in 5 days",    frequency:"Weekly",     status:"due-soon" },
    { id:"M-007", asset:"Heating circuit, 2nd floor",      assetId:"AST-0061", site:"Aviva Office Tower",          type:"Run hours",       reading:"6,180",   unit:"h",       lastRead:"4 days ago",  nextDue:"in 24 days",   frequency:"Monthly",    status:"on-schedule" },
    { id:"M-008", asset:"Loading bay door 2",              assetId:"AST-0154", site:"Northgate Logistics Hub",    type:"Open/close cycles", reading:"55,210", unit:"cycles",  lastRead:"1 week ago",  nextDue:"in 0 days",    frequency:"Weekly",     status:"due-soon" },
    { id:"M-009", asset:"Self-check kiosk 3",              assetId:"AST-0231", site:"Galway City Library",         type:"Transactions",     reading:"24,180", unit:"txns",    lastRead:"3 days ago",  nextDue:"in 11 days",   frequency:"Monthly",    status:"on-schedule" },
  ];

  const ppmTasks = [
    { id:"PPM-105", name:"Drain line condensate flush",          asset:"Cold store refrigeration unit",   site:"Northgate Logistics Hub",   frequency:"Monthly",    nextDue:"2 days overdue",  bucket:"overdue",     lastDone:"Apr 2026", assignee:"AquaFix Plumbing",   initials:"AF", status:"overdue",     duration:"1h 30m" },
    { id:"PPM-110", name:"Loading bay door grease and check",    asset:"Loading bay door 2",              site:"Northgate Logistics Hub",   frequency:"Monthly",    nextDue:"4 days overdue",  bucket:"overdue",     lastDone:"Apr 2026", assignee:"Citywide Facilities", initials:"CF", status:"overdue",     duration:"1h" },
    { id:"PPM-104", name:"Pool plant chemical balance",          asset:"Pool filtration pump",            site:"Tramore Leisure Centre",   frequency:"Weekly",     nextDue:"tomorrow",        bucket:"this-week",   lastDone:"last Tue", assignee:"Liam McCarthy",       initials:"LM", status:"due-soon",    duration:"45m" },
    { id:"PPM-102", name:"Fire alarm panel — quarterly test",     asset:"Fire alarm panel",                site:"Lee Valley Medical Centre", frequency:"Quarterly",  nextDue:"in 4 days",       bucket:"this-week",   lastDone:"Mar 2026", assignee:"FireSafe Ltd",        initials:"FS", status:"scheduled",   duration:"2h" },
    { id:"PPM-108", name:"AHU filter swap",                       asset:"Rooftop HVAC unit 3",             site:"Aviva Office Tower",        frequency:"Bi-monthly", nextDue:"in progress",     bucket:"this-week",   lastDone:"Apr 2026", assignee:"Murphy Mechanical",  initials:"MM", status:"in-progress", duration:"1h" },
    { id:"PPM-106", name:"Emergency lighting test",                asset:"Emergency lighting circuit",      site:"Riverside Retail Park",    frequency:"Monthly",    nextDue:"in 9 days",       bucket:"next-14",     lastDone:"May 2026", assignee:"S. Byrne General",   initials:"SB", status:"scheduled",   duration:"1h" },
    { id:"PPM-101", name:"Quarterly HVAC service",                asset:"Rooftop HVAC unit 3",             site:"Aviva Office Tower",        frequency:"Quarterly",  nextDue:"in 12 days",      bucket:"next-14",     lastDone:"Mar 2026", assignee:"Murphy Mechanical",  initials:"MM", status:"scheduled",   duration:"3h" },
    { id:"PPM-107", name:"Auto-door safety check",                 asset:"Automatic door, main entrance",  site:"Riverside Retail Park",    frequency:"Monthly",    nextDue:"in 18 days",      bucket:"later",       lastDone:"May 2026", assignee:"S. Byrne General",   initials:"SB", status:"scheduled",   duration:"30m" },
    { id:"PPM-109", name:"Heating circuit pressure test",          asset:"Heating circuit, 2nd floor",     site:"Aviva Office Tower",        frequency:"Quarterly",  nextDue:"in 23 days",      bucket:"later",       lastDone:"Mar 2026", assignee:"Murphy Mechanical",  initials:"MM", status:"scheduled",   duration:"2h" },
    { id:"PPM-103", name:"Lift annual inspection (LOLER)",         asset:"Passenger lift A",                site:"Aviva Office Tower",        frequency:"Annually",   nextDue:"in 6 weeks",      bucket:"later",       lastDone:"Aug 2025", assignee:"Citywide Facilities", initials:"CF", status:"scheduled",   duration:"4h" },
    { id:"PPM-111", name:"Quarterly self-check kiosk service",      asset:"Self-check kiosk 3",              site:"Galway City Library",        frequency:"Quarterly",  nextDue:"in 14 days",      bucket:"next-14",     lastDone:"Mar 2026", assignee:"Citywide Facilities", initials:"CF", status:"scheduled",   duration:"1h 30m" },
  ];

  const ownStaff = [
    { id:"st1", name:"Aoife Kelly",       role:"Facilities Manager",         sites:"All sites",                          initials:"AK",
      certs:[
        { name:"SafePass",                  issued:"01 Jun 2024", expires:"01 Jun 2028", status:"valid" },
        { name:"Manual Handling",            issued:"05 Mar 2025", expires:"05 Mar 2028", status:"valid" },
        { name:"First Aid Responder (FAR)",  issued:"12 Sep 2023", expires:"12 Sep 2025", status:"expired" },
        { name:"Working at Heights",         issued:"04 Feb 2024", expires:"04 Feb 2027", status:"valid" },
      ]},
    { id:"st2", name:"Liam Doyle",         role:"Security and maintenance",   sites:"Northgate Logistics Hub",            initials:"LD",
      certs:[
        { name:"SafePass",                  issued:"19 Apr 2023", expires:"19 Apr 2027", status:"valid" },
        { name:"Manual Handling",            issued:"06 May 2024", expires:"06 May 2027", status:"valid" },
        { name:"PSA security licence",        issued:"01 Jan 2024", expires:"01 Jan 2027", status:"valid" },
        { name:"Counter-balance forklift",   issued:"15 Mar 2023", expires:"15 Mar 2028", status:"valid" },
      ]},
    { id:"st3", name:"Patricia Ryan",      role:"Cleaner and FM",              sites:"Riverside Retail Park",              initials:"PR",
      certs:[
        { name:"SafePass",                  issued:"22 Jun 2022", expires:"22 Jun 2026", status:"expiring", inDays:3 },
        { name:"Manual Handling",            issued:"03 Sep 2024", expires:"03 Sep 2027", status:"valid" },
        { name:"COSHH awareness",            issued:"08 Nov 2023", expires:"08 Nov 2026", status:"valid" },
        { name:"First Aid (occupational)",   issued:"14 Feb 2025", expires:"14 Feb 2027", status:"valid" },
      ]},
    { id:"st4", name:"Owen Farrell",       role:"Site Lead",                    sites:"Northgate Logistics Hub",            initials:"OF",
      certs:[
        { name:"SafePass",                  issued:"15 May 2024", expires:"15 May 2028", status:"valid" },
        { name:"Manual Handling",            issued:"10 Jun 2024", expires:"10 Jun 2027", status:"valid" },
        { name:"Working at Heights",         issued:"22 Mar 2025", expires:"22 Mar 2028", status:"valid" },
        { name:"First Aid Responder (FAR)",  issued:"22 Mar 2025", expires:"22 Mar 2027", status:"valid" },
      ]},
    { id:"st5", name:"Siobhan Walsh",      role:"Cleaner",                      sites:"Aviva Office Tower",                  initials:"SW",
      certs:[
        { name:"SafePass",                  issued:"01 Nov 2023", expires:"01 Nov 2027", status:"valid" },
        { name:"Manual Handling",            issued:"04 Mar 2024", expires:"04 Mar 2027", status:"valid" },
        { name:"COSHH awareness",            issued:"05 May 2024", expires:"05 May 2027", status:"valid" },
        { name:"First Aid (occupational)",   issued:"15 Sep 2024", expires:"15 Sep 2026", status:"expiring", inDays:88 },
      ]},
    { id:"st6", name:"Declan Moore",       role:"Maintenance Technician",       sites:"Lee Valley Medical Centre",          initials:"DM",
      certs:[
        { name:"SafePass",                  issued:"07 Feb 2025", expires:"07 Feb 2029", status:"valid" },
        { name:"Manual Handling",            issued:"07 Feb 2025", expires:"07 Feb 2028", status:"valid" },
        { name:"Working at Heights",         issued:"12 Mar 2024", expires:"12 Mar 2027", status:"valid" },
        { name:"Counter-balance forklift",   issued:"22 Aug 2025", expires:"22 Aug 2030", status:"valid" },
      ]},
    { id:"st7", name:"Niamh Delaney",      role:"Cleaner",                      sites:"Tramore Leisure Centre",             initials:"ND",
      certs:[
        { name:"SafePass",                  issued:"22 Jul 2023", expires:"22 Jul 2027", status:"valid" },
        { name:"Manual Handling",            issued:"10 Oct 2024", expires:"10 Oct 2027", status:"valid" },
        { name:"COSHH awareness",            issued:"15 Apr 2024", expires:"15 Apr 2027", status:"valid" },
        { name:"Pool plant operator",        issued:"01 Mar 2024", expires:"01 Mar 2027", status:"valid" },
      ]},
  ];

  // Floor plans: each site has rooms (top-down rects) and pins (smart signs)
  const floorPlanSites = [
    { id:"s1", name:"Riverside Retail Park", shortName:"Riverside", floors:[
      { id:"gf", name:"Ground floor",
        rooms:[
          { x:820, y:40,  w:140, h:520, label:"Stockroom" },
          { x:720, y:40,  w:100, h:80,  label:"WCs" },
          { x:60,  y:80,  w:660, h:50,  label:"Aisle 1 — Produce" },
          { x:60,  y:160, w:660, h:50,  label:"Aisle 2 — Bakery" },
          { x:60,  y:240, w:660, h:50,  label:"Aisle 3 — Chilled" },
          { x:60,  y:320, w:660, h:50,  label:"Aisle 4 — Grocery" },
          { x:60,  y:400, w:660, h:50,  label:"Aisle 5 — Household" },
          { x:60,  y:490, w:360, h:60,  label:"Checkouts" },
          { x:440, y:490, w:280, h:60,  label:"Entrance lobby" },
        ],
        pins:[
          { id:"HGR-1003", label:"Aisle 4 — produce drip",     x:38, y:60, state:"deployed", note:"Activated 14:31 · cleaner en route" },
          { id:"HGR-1007", label:"Till 3 — coffee spill",       x:18, y:90, state:"deployed", note:"Activated 14:48 · sign on floor" },
          { id:"HGR-1001", label:"Entrance lobby",              x:58, y:90, state:"cleared",  note:"On rack · last deploy 12:18" },
          { id:"HGR-1004", label:"Aisle 1",                     x:30, y:18, state:"cleared",  note:"On rack" },
          { id:"HGR-1005", label:"Aisle 3",                     x:50, y:45, state:"cleared",  note:"On rack" },
          { id:"HGR-1006", label:"WCs",                          x:77, y:13, state:"cleared",  note:"On rack" },
          { id:"HGR-1010", label:"Stockroom door",              x:90, y:60, state:"cleared",  note:"On rack" },
        ]},
    ]},
    { id:"s2", name:"Northgate Logistics Hub", shortName:"Northgate", floors:[
      { id:"wh", name:"Warehouse",
        rooms:[
          { x:40,  y:40,  w:520, h:100, label:"Loading bay 1" },
          { x:40,  y:160, w:520, h:100, label:"Loading bay 2" },
          { x:40,  y:280, w:520, h:100, label:"Loading bay 3" },
          { x:40,  y:400, w:680, h:160, label:"Warehouse — racks" },
          { x:600, y:40,  w:360, h:200, label:"Cold store" },
          { x:600, y:260, w:180, h:120, label:"Site office" },
          { x:800, y:260, w:160, h:120, label:"Staff room" },
          { x:740, y:400, w:220, h:160, label:"Plant room" },
        ],
        pins:[
          { id:"HGR-2007", label:"Loading bay 2 — drain leak",  x:25, y:35, state:"deployed", note:"Activated 14:08 · plumber inbound" },
          { id:"HGR-2008", label:"Cold store entry — condensate", x:62, y:38, state:"deployed", note:"Activated 13:42 · mopping" },
          { id:"HGR-2001", label:"Loading bay 1",                x:15, y:13, state:"cleared",  note:"On rack" },
          { id:"HGR-2002", label:"Loading bay 3",                x:20, y:53, state:"cleared",  note:"On rack" },
          { id:"HGR-2003", label:"Warehouse south aisle",        x:40, y:80, state:"cleared",  note:"On rack" },
          { id:"HGR-2004", label:"Cold store interior",          x:80, y:22, state:"cleared",  note:"On rack" },
        ]},
    ]},
    { id:"s3", name:"Aviva Office Tower", shortName:"Aviva", floors:[
      { id:"l2", name:"Level 2",
        rooms:[
          { x:40,  y:40,  w:240, h:140, label:"Reception" },
          { x:300, y:40,  w:200, h:140, label:"Meeting 2A" },
          { x:520, y:40,  w:200, h:140, label:"Meeting 2B" },
          { x:740, y:40,  w:220, h:140, label:"Kitchenette" },
          { x:40,  y:200, w:680, h:280, label:"Open-plan office" },
          { x:740, y:200, w:110, h:130, label:"WC" },
          { x:860, y:200, w:100, h:130, label:"Stairs" },
          { x:740, y:350, w:220, h:130, label:"Server room" },
        ],
        pins:[
          { id:"HGR-3002", label:"Kitchenette — tap drip",       x:84, y:18, state:"deployed", note:"Activated 14:52 · cleaner notified" },
          { id:"HGR-3001", label:"Reception",                     x:18, y:18, state:"cleared",  note:"On rack" },
          { id:"HGR-3003", label:"Open-plan office",              x:38, y:60, state:"cleared",  note:"On rack" },
          { id:"HGR-3004", label:"WC",                              x:80, y:45, state:"cleared",  note:"On rack" },
          { id:"HGR-3005", label:"Server room",                    x:84, y:70, state:"cleared",  note:"On rack" },
        ]},
    ]},
  ];

  // Devices: hangers (sign sensors) + LoRa gateways, grouped by building
  const deviceBuildings = [
    { id:"b1", name:"Riverside Retail Park", devices:[
      { id:"HGR-1001", type:"Hanger",  room:"Entrance lobby",     online:true,  battery:78, signal:4, lastSeen:"now",    flags:[] },
      { id:"HGR-1003", type:"Hanger",  room:"Aisle 4 — produce",  online:true,  battery:62, signal:5, lastSeen:"now",    flags:[] },
      { id:"HGR-1004", type:"Hanger",  room:"Aisle 1",             online:true,  battery:91, signal:4, lastSeen:"3m ago", flags:[] },
      { id:"HGR-1005", type:"Hanger",  room:"Aisle 3",             online:true,  battery:88, signal:3, lastSeen:"5m ago", flags:[] },
      { id:"HGR-1006", type:"Hanger",  room:"WCs",                  online:true,  battery:70, signal:3, lastSeen:"4m ago", flags:[] },
      { id:"HGR-1007", type:"Hanger",  room:"Checkouts · till 3",  online:true,  battery:14, signal:5, lastSeen:"1m ago", flags:["Low battery"] },
      { id:"HGR-1010", type:"Hanger",  room:"Stockroom",            online:true,  battery:81, signal:4, lastSeen:"2m ago", flags:[] },
      { id:"GW-RV-01", type:"Gateway", room:"Plant room",           online:true,  battery:null, signal:5, lastSeen:"10s ago", flags:[] },
      { id:"GW-RV-02", type:"Gateway", room:"Stockroom roof",       online:true,  battery:null, signal:4, lastSeen:"12s ago", flags:[] },
    ]},
    { id:"b2", name:"Northgate Logistics Hub", devices:[
      { id:"HGR-2001", type:"Hanger",  room:"Loading bay 1",        online:true,  battery:84, signal:3, lastSeen:"2m ago", flags:[] },
      { id:"HGR-2002", type:"Hanger",  room:"Loading bay 3",        online:true,  battery:9,  signal:2, lastSeen:"now",    flags:["Low battery"] },
      { id:"HGR-2003", type:"Hanger",  room:"Warehouse south aisle", online:false, battery:0,  signal:0, lastSeen:"47m ago", flags:["Anti-theft","Last known: outside geofence"] },
      { id:"HGR-2004", type:"Hanger",  room:"Cold store interior",  online:true,  battery:67, signal:4, lastSeen:"now",    flags:[] },
      { id:"HGR-2007", type:"Hanger",  room:"Loading bay 2",        online:true,  battery:56, signal:4, lastSeen:"now",    flags:[] },
      { id:"HGR-2008", type:"Hanger",  room:"Cold store entry",     online:true,  battery:75, signal:4, lastSeen:"now",    flags:[] },
      { id:"GW-NG-01", type:"Gateway", room:"Site office",           online:true,  battery:null, signal:5, lastSeen:"5s ago", flags:[] },
      { id:"GW-NG-02", type:"Gateway", room:"Plant room",            online:true,  battery:null, signal:4, lastSeen:"6s ago", flags:[] },
    ]},
    { id:"b3", name:"Aviva Office Tower", devices:[
      { id:"HGR-3001", type:"Hanger",  room:"Reception",            online:true, battery:80, signal:5, lastSeen:"30s ago", flags:[] },
      { id:"HGR-3002", type:"Hanger",  room:"Kitchenette",          online:true, battery:66, signal:4, lastSeen:"now",     flags:[] },
      { id:"HGR-3003", type:"Hanger",  room:"Open-plan office",     online:true, battery:92, signal:5, lastSeen:"1m ago",  flags:[] },
      { id:"HGR-3004", type:"Hanger",  room:"WC",                    online:true, battery:41, signal:3, lastSeen:"2m ago",  flags:[] },
      { id:"HGR-3005", type:"Hanger",  room:"Server room",          online:true, battery:55, signal:5, lastSeen:"now",     flags:[] },
      { id:"GW-AV-01", type:"Gateway", room:"Level 2 IT cupboard",  online:true, battery:null, signal:5, lastSeen:"10s ago", flags:[] },
    ]},
    { id:"b4", name:"Lee Valley Medical Centre", devices:[
      { id:"HGR-4001", type:"Hanger",  room:"Reception",             online:true, battery:73, signal:4, lastSeen:"now",    flags:[] },
      { id:"HGR-4002", type:"Hanger",  room:"Treatment room 2",      online:true, battery:18, signal:3, lastSeen:"2m ago", flags:["Low battery"] },
      { id:"HGR-4003", type:"Hanger",  room:"Pharmacy corridor",     online:true, battery:60, signal:4, lastSeen:"1m ago", flags:[] },
      { id:"GW-LV-01", type:"Gateway", room:"Plant room",            online:true, battery:null, signal:5, lastSeen:"8s ago", flags:[] },
    ]},
    { id:"b5", name:"Tramore Leisure Centre", devices:[
      { id:"HGR-5001", type:"Hanger",  room:"Pool deck",             online:true,  battery:47, signal:3, lastSeen:"now",    flags:[] },
      { id:"HGR-5002", type:"Hanger",  room:"Changing rooms",        online:true,  battery:62, signal:3, lastSeen:"1m ago", flags:[] },
      { id:"HGR-5003", type:"Hanger",  room:"Main entrance",         online:false, battery:0,  signal:0, lastSeen:"2h ago", flags:["Anti-theft"] },
      { id:"GW-TM-01", type:"Gateway", room:"Plant room",            online:true,  battery:null, signal:4, lastSeen:"10s ago", flags:[] },
    ]},
  ];

  // Live spill alerts. `escalateInSec` is seconds remaining when the page loads.
  const spillAlerts = [
    { id:"SP-2041", site:"Riverside Retail Park",    siteShort:"Riverside",   location:"Aisle 4 — produce",         hanger:"HGR-1003", state:"new",          severity:"high",   raisedAt:"14:31", since:"24m",  escalateInSec:142, escalateTotal:300,
      liveStatus:"Cleaner en route", liveStatusTone:"accent",
      note:"Hanger sensor confirmed wet floor. Sign automatically deployed. Cleaner Patricia Ryan on the way." },
    { id:"SP-2040", site:"Riverside Retail Park",    siteShort:"Riverside",   location:"Checkouts · till 3",        hanger:"HGR-1007", state:"new",          severity:"medium", raisedAt:"14:48", since:"7m",   escalateInSec:298, escalateTotal:300,
      liveStatus:"Sign deployed, awaiting cleaner", liveStatusTone:"warn",
      note:"Customer-reported coffee spill, supervisor took the sign off the rack." },
    { id:"SP-2039", site:"Aviva Office Tower",        siteShort:"Aviva",        location:"Kitchenette · level 2",     hanger:"HGR-3002", state:"new",          severity:"low",    raisedAt:"14:52", since:"3m",   escalateInSec:540, escalateTotal:600,
      liveStatus:"Cleaner notified, low urgency", liveStatusTone:"muted",
      note:"Slow tap drip. Cleaner notified, low urgency." },
    { id:"SP-2038", site:"Northgate Logistics Hub",  siteShort:"Northgate",   location:"Loading bay 2",              hanger:"HGR-2007", state:"acknowledged", severity:"high",   raisedAt:"14:08", ackBy:"Owen Farrell (Site lead)", ackAt:"14:11",
      note:"Drainage leak under the cold-store door. Plumber inbound, work order WO-2041 raised." },
    { id:"SP-2037", site:"Northgate Logistics Hub",  siteShort:"Northgate",   location:"Cold store entry",           hanger:"HGR-2008", state:"acknowledged", severity:"medium", raisedAt:"13:42", ackBy:"Owen Farrell (Site lead)", ackAt:"13:44",
      note:"Condensation puddle from the chiller door seal. Mopping in progress." },
    { id:"SP-2034", site:"Riverside Retail Park",    siteShort:"Riverside",   location:"Entrance lobby",             hanger:"HGR-1001", state:"resolved",     severity:"medium", raisedAt:"12:18", resolvedBy:"Patricia Ryan", resolvedAt:"12:40",
      note:"Rain track-in cleared, mat re-laid, sign returned to the rack." },
    { id:"SP-2033", site:"Aviva Office Tower",        siteShort:"Aviva",        location:"Reception",                  hanger:"HGR-3001", state:"resolved",     severity:"low",    raisedAt:"09:42", resolvedBy:"Siobhan Walsh", resolvedAt:"09:51",
      note:"Spilled coffee cleared and floor dried. No injuries reported." },
  ];

  return { sites, kpis, feed, disciplines, workOrders, woDetail, assets, sds,
           rounds, inspectionAreas, incidents, patrols, loneWorkers, sdsExtraction, reportData,
           floorPlanSites, deviceBuildings, spillAlerts,
           contractors, reminders,
           maintenanceMetrics, parts, meters, ppmTasks, ownStaff };
})();

/* ── Live-org wiring ──────────────────────────────────────────────────────────
   The prototype reads HL synchronously, so to run as a real organisation we
   mutate HL in place. resetHLEmpty() clears every list so a brand-new org shows
   empty states; hydrateHL() merges in data fetched from the backend;
   setCurrentUser() records the signed-in user for the greeting + account menu.
   Driven by prototype/live.tsx. The public /preview route never calls these, so
   it keeps showing the full sample as a design showcase. */
function _resetDeep(o: any) {
  if (!o || typeof o !== "object") return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (Array.isArray(v)) { v.length = 0; }            // empty every list
    else if (typeof v === "number") { o[k] = 0; }       // zero demo metrics (94%, MTTR…)
    else if (typeof v === "string") { if (k === "trend") o[k] = ""; } // drop demo deltas "-12%"
    else if (v && typeof v === "object") { _resetDeep(v); }
  }
}
export function resetHLEmpty() { _resetDeep(HL); }
export function hydrateHL(partial: any) { Object.assign(HL, partial || {}); }
export function setCurrentUser(u: any) { (HL as any).currentUser = u; }
