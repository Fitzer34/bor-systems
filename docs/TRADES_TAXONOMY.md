# Trades & disciplines — building maintenance

The full set of trades a building can need, for **trade-based tender routing** (a job
goes only to contractors who cover that trade). Grouped for the category picker.
Every list ends with **"Other — type your own,"** which flags a new trade for the
orchestrator to approve/add.

Trades marked **⚖︎** carry a **statutory inspection** obligation, so the compliance
gate for those jobs requires the matching certificate (drives §7 of the spec).

---

## A. Mechanical & HVAC
- Heating & boilers (gas / oil / biomass / heat pumps) **⚖︎ (gas)**
- Ventilation & ductwork (AHUs, fans, extract)
- Air conditioning & refrigeration (split / VRV / chillers) **⚖︎ (F-gas, TM44)**
- Chillers & cooling towers
- BMS / building controls & automation
- Plumbing & sanitaryware
- Hot water — calorifiers / water heaters
- Pumps & pressurisation
- Commercial gas services **⚖︎**
- Compressed air

## B. Electrical & power
- General electrical (install / repair)
- Fixed-wire testing — EICR **⚖︎**
- Portable appliance testing — PAT **⚖︎**
- Lighting (incl. LED upgrades)
- Emergency lighting (test & service) **⚖︎**
- Standby generators
- UPS & battery systems
- Switchgear / distribution / thermographic survey
- Lightning protection & earthing **⚖︎**
- EV charge points
- Solar PV / renewables

## C. Vertical transport
- Lifts / elevators (service + LOLER thorough exam) **⚖︎**
- Escalators & moving walkways **⚖︎**
- Platform lifts / hoists / stairlifts **⚖︎**
- Dock levellers / loading-bay equipment

## D. Fire & life safety
- Fire detection & alarm systems **⚖︎**
- Fire extinguishers (service) **⚖︎**
- Sprinklers / fire suppression **⚖︎**
- Dry & wet risers **⚖︎**
- Fire damper inspection & testing **⚖︎**
- Smoke ventilation / AOV
- Fire doors (inspection) **⚖︎**
- Passive fire protection / fire-stopping
- Fire risk assessment **⚖︎**

## E. Security & access
- Access control
- CCTV / surveillance
- Intruder / burglar alarms
- Door entry / intercom
- Automatic doors, gates, barriers, roller shutters
- Manned guarding

## F. Water & drainage
- Water hygiene / legionella (risk assessment, monitoring) **⚖︎**
- Water treatment (closed systems, cooling towers)
- Drainage — jetting / CCTV survey
- Leak detection
- Pumping stations / sumps
- Grease traps

## G. Building fabric & finishes
- Roofing & gutters (flat / pitched)
- Glazing / windows / curtain walling
- Painting & decorating
- Plastering / rendering
- Carpentry & joinery
- Flooring (carpet / vinyl / resin / tiling)
- Masonry / brickwork / pointing
- Ceilings, partitions & drylining
- Locksmith
- Signage
- Fencing & gates
- Metalwork / welding / fabrication
- Waterproofing / damp-proofing
- Asbestos survey / management / removal (licensed) **⚖︎**

## H. Specialist equipment
- Catering / kitchen equipment + extract cleaning (TR19) **⚖︎ (extract)**
- Cold rooms / commercial refrigeration **⚖︎ (F-gas)**
- Swimming pool / spa plant
- Laboratory equipment / fume cupboards — LEV testing **⚖︎**
- Medical gas (HTM)
- Window cleaning / high-level access (abseil/MEWP)

## I. Soft FM & grounds (often in scope)
- Cleaning / janitorial
- Grounds maintenance / landscaping / gardening
- Pest control
- Waste management / recycling
- Winter gritting / snow clearance
- Washroom / hygiene services

## J. Cross-cutting statutory inspection & testing
(Many overlap the trades above; some buildings buy them as standalone "compliance"
jobs.) EICR · PAT · Gas safety · LOLER · PSSR (pressure systems) · Legionella/water ·
TM44 air-con · Fire risk assessment · Fire alarm/extinguisher/emergency-lighting
servicing · Fire damper testing · LEV testing · Asbestos management survey ·
Lightning protection testing · EPC / ESOS energy assessment.

## Other
**"Other — type your own"** on every list. Free-text entry creates a pending trade
the orchestrator can approve into their taxonomy, so the system is never a blocker
when something unusual comes up.

---

*Sources: [UK FM statutory inspections guide](https://www.ukfsl.co.uk/industry-news/the-facilities-managers-guide-to-statutory-inspections), [Facilio — UK FM statutory compliance](https://facilio.com/blog/statutory-compliance-for-facilities-management/), [TM44 (Wikipedia)](https://en.wikipedia.org/wiki/TM44_inspections), [Servicon — facility maintenance services](https://servicon.com/glossary/facility-maintenance-services/). Trades validated against these + domain knowledge; refine to your market.*
