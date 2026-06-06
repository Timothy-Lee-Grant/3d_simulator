/**
 * dialogue.js — branching conversation trees for all three NPCs.
 *
 * ── Structure ─────────────────────────────────────────────────────────────
 *
 * DIALOGUE[npcId][nodeKey] = {
 *   speaker:   string          — display name shown above the text
 *   text:      string          — what the NPC says
 *   responses: Array<{
 *     label: string            — what the player says / chooses
 *     next:  string | null     — next nodeKey, or null to close dialogue
 *   }>
 * }
 *
 * Every NPC has two entry nodes:
 *   'greeting'        — first meeting
 *   'return_greeting' — subsequent meetings (useWorldStore.interactedNPCs tracks this)
 *
 * ── Navigation rules ─────────────────────────────────────────────────────
 *
 *   next: 'someKey'  → navigate to that node within the same NPC tree
 *   next: null       → close dialogue, release pointer lock, return to game
 *
 * Keyboard shortcut: number keys 1–4 select the nth response.
 * Mouse: click response button in the panel.
 */

export const DIALOGUE = {

  // ── The Stranger ──────────────────────────────────────────────────────────

  npc_01: {
    greeting: {
      speaker: 'The Stranger',
      text: "Hey. Didn't expect to see anyone out here.",
      responses: [
        { label: "Who are you?",          next: 'identity'  },
        { label: "What happened here?",   next: 'place'     },
        { label: "You seem troubled.",    next: 'troubled'  },
        { label: "Goodbye.",              next: null        },
      ],
    },
    return_greeting: {
      speaker: 'The Stranger',
      text: "You're back. I figured you would be.",
      responses: [
        { label: "I had more questions.", next: 'greeting'  },
        { label: "Just passing through.", next: null        },
      ],
    },
    identity: {
      speaker: 'The Stranger',
      text: "Someone who came here looking for answers. Found more questions instead. That's usually how it goes.",
      responses: [
        { label: "What questions?",          next: 'questions' },
        { label: "Where did you come from?", next: 'origin'    },
        { label: "Back.",                    next: 'greeting'  },
      ],
    },
    questions: {
      speaker: 'The Stranger',
      text: "About this place. About why it feels like it's been waiting. About who built it, and whether they're coming back.",
      responses: [
        { label: "And the answers?", next: 'no_answers' },
        { label: "Back.",            next: 'identity'   },
      ],
    },
    no_answers: {
      speaker: 'The Stranger',
      text: "None so far. But I keep looking. What else would you do?",
      responses: [
        { label: "Keep going, I guess.", next: null        },
        { label: "Back.",                next: 'greeting'  },
      ],
    },
    origin: {
      speaker: 'The Stranger',
      text: "Far from here. Long time ago. Doesn't matter anymore.",
      responses: [
        { label: "It might matter.", next: 'origin_2'  },
        { label: "Back.",            next: 'greeting'  },
      ],
    },
    origin_2: {
      speaker: 'The Stranger',
      text: "Maybe. But the past is dead weight if you carry it wrong. I travel light.",
      responses: [
        { label: "I understand.", next: null       },
        { label: "Back.",         next: 'greeting' },
      ],
    },
    place: {
      speaker: 'The Stranger',
      text: "Something changed here. You can feel it — like the air is holding its breath. The others feel it too.",
      responses: [
        { label: "The others?",       next: 'others'   },
        { label: "Feel what exactly?", next: 'feeling' },
        { label: "Back.",              next: 'greeting' },
      ],
    },
    others: {
      speaker: 'The Stranger',
      text: "The Wanderer. The Gatekeeper. We all ended up here from different paths. That can't be coincidence.",
      responses: [
        { label: "What do they know?", next: 'others_2' },
        { label: "Back.",              next: 'greeting' },
      ],
    },
    others_2: {
      speaker: 'The Stranger',
      text: "More than they say, probably. Especially the Gatekeeper. You'll have to judge that yourself.",
      responses: [
        { label: "I will.", next: null       },
        { label: "Back.",   next: 'greeting' },
      ],
    },
    feeling: {
      speaker: 'The Stranger',
      text: "Like something is about to happen. Or already did, and we just haven't caught up to it yet.",
      responses: [
        { label: "That's unsettling.", next: null       },
        { label: "Back.",              next: 'greeting' },
      ],
    },
    troubled: {
      speaker: 'The Stranger',
      text: "Is it that obvious? I've been here a long time. Long enough to start wondering if I'll ever leave.",
      responses: [
        { label: "What keeps you here?", next: 'keeps_here' },
        { label: "You could leave now.", next: 'leave'      },
        { label: "Back.",                next: 'greeting'   },
      ],
    },
    keeps_here: {
      speaker: 'The Stranger',
      text: "The same thing that brought me here. An unfinished thing. I can feel it. Just can't see it yet.",
      responses: [
        { label: "I hope you find it.", next: null       },
        { label: "Back.",               next: 'greeting' },
      ],
    },
    leave: {
      speaker: 'The Stranger',
      text: "Could I? You make it sound so simple. Maybe you're right. That thought scares me more than staying.",
      responses: [
        { label: "Take your time.", next: null       },
        { label: "Back.",           next: 'greeting' },
      ],
    },
  },

  // ── The Wanderer ──────────────────────────────────────────────────────────

  npc_02: {
    greeting: {
      speaker: 'The Wanderer',
      text: "Oh! A new face. I collect those, you know. New faces.",
      responses: [
        { label: "You collect faces?",       next: 'collect' },
        { label: "What are you doing here?", next: 'purpose' },
        { label: "Have we met?",             next: 'met'     },
        { label: "I'll leave you be.",       next: null      },
      ],
    },
    return_greeting: {
      speaker: 'The Wanderer',
      text: "Already added you to my collection — but a second visit? That's a new category entirely.",
      responses: [
        { label: "What category?",  next: 'category' },
        { label: "Hello again.",    next: null        },
      ],
    },
    category: {
      speaker: 'The Wanderer',
      text: "The ones who come back. Most people only visit a memory once. You're more curious than that.",
      responses: [
        { label: "Maybe I am.", next: null        },
        { label: "Back.",       next: 'greeting'  },
      ],
    },
    collect: {
      speaker: 'The Wanderer',
      text: "Not literally! Well — maybe a little literally. I draw them. Sketches. I've been everywhere, and I keep track of everyone I meet. You never know when a face becomes important.",
      responses: [
        { label: "Am I in your sketchbook?", next: 'sketch'  },
        { label: "Why does it matter?",      next: 'matters' },
        { label: "Back.",                    next: 'greeting' },
      ],
    },
    sketch: {
      speaker: 'The Wanderer',
      text: "You are now.",
      responses: [
        { label: "What does it look like?", next: 'sketch_2' },
        { label: "I'm flattered.",          next: null        },
      ],
    },
    sketch_2: {
      speaker: 'The Wanderer',
      text: "Curious. Open. A little lost, but in the good way — the way that means you're still looking.",
      responses: [
        { label: "That's surprisingly accurate.", next: null       },
        { label: "Back.",                         next: 'greeting' },
      ],
    },
    matters: {
      speaker: 'The Wanderer',
      text: "Because the people you forget are the ones you needed. I learned that the hard way. Now I write everything down.",
      responses: [
        { label: "What did you forget?", next: 'forgot'  },
        { label: "Back.",                next: 'greeting' },
      ],
    },
    forgot: {
      speaker: 'The Wanderer',
      text: "Someone who knew where I needed to go before I did. I walked right past them. Never found them again.",
      responses: [
        { label: "I'm sorry.", next: null       },
        { label: "Back.",      next: 'greeting' },
      ],
    },
    purpose: {
      speaker: 'The Wanderer',
      text: "Passing through, same as always. Except this place doesn't quite let you pass through. You arrive, and the leaving feels... optional.",
      responses: [
        { label: "What do you mean?",      next: 'stuck'       },
        { label: "Where were you headed?", next: 'destination' },
        { label: "Back.",                  next: 'greeting'    },
      ],
    },
    stuck: {
      speaker: 'The Wanderer',
      text: "Not trapped. Just comfortable enough that moving on feels like giving something up. This place has that quality.",
      responses: [
        { label: "What does it offer?", next: 'offer'   },
        { label: "Back.",               next: 'greeting' },
      ],
    },
    offer: {
      speaker: 'The Wanderer',
      text: "Company. Familiarity. The feeling that someone — or something — knows you're here. That's rarer than you'd think.",
      responses: [
        { label: "That means a lot.", next: null       },
        { label: "Back.",             next: 'greeting' },
      ],
    },
    destination: {
      speaker: 'The Wanderer',
      text: "South. Always south. I follow a hunch that the coast looks different in winter. Haven't made it yet.",
      responses: [
        { label: "Will you keep trying?", next: null       },
        { label: "Back.",                 next: 'greeting' },
      ],
    },
    met: {
      speaker: 'The Wanderer',
      text: "In this life? No, I don't think so. But you feel familiar. Some people come pre-loaded that way.",
      responses: [
        { label: "What do you mean?",  next: 'familiar' },
        { label: "Just checking.",     next: null        },
        { label: "Back.",              next: 'greeting'  },
      ],
    },
    familiar: {
      speaker: 'The Wanderer',
      text: "Like the feeling when a word sounds right before you know what it means. Recognition without memory. You have that.",
      responses: [
        { label: "Strange.", next: null       },
        { label: "Back.",    next: 'greeting' },
      ],
    },
  },

  // ── The Gatekeeper ────────────────────────────────────────────────────────

  npc_03: {
    greeting: {
      speaker: 'The Gatekeeper',
      text: "You came. I wondered when you would.",
      responses: [
        { label: "Were you expecting me?",                           next: 'expected' },
        { label: "Who are you?",                                     next: 'who'      },
        { label: "What gate do you keep?",                          next: 'gate'     },
        { label: "I think you have me confused with someone.",      next: null       },
      ],
    },
    return_greeting: {
      speaker: 'The Gatekeeper',
      text: "You returned. Good. The ones who return understand something the others don't.",
      responses: [
        { label: "What do they understand?",   next: 'understand' },
        { label: "I had unfinished questions.", next: 'greeting'   },
        { label: "I'm not sure I do.",          next: null         },
      ],
    },
    understand: {
      speaker: 'The Gatekeeper',
      text: "That what matters isn't found the first time. That meaning accretes, like sediment. Slowly.",
      responses: [
        { label: "That's a beautiful way to say it.", next: null       },
        { label: "Back.",                             next: 'greeting' },
      ],
    },
    expected: {
      speaker: 'The Gatekeeper',
      text: "Not you specifically. But someone like you. Someone who moves through the world and asks 'why.' There are fewer than you'd think.",
      responses: [
        { label: "Am I one of them?",        next: 'one_of_them' },
        { label: "Who else do you expect?",  next: 'others'      },
        { label: "Back.",                    next: 'greeting'    },
      ],
    },
    one_of_them: {
      speaker: 'The Gatekeeper',
      text: "You're here, asking. That's the criterion.",
      responses: [
        { label: "That simple?", next: 'simple'  },
        { label: "Back.",        next: 'greeting' },
      ],
    },
    simple: {
      speaker: 'The Gatekeeper',
      text: "The most important things always are. The difficulty isn't understanding them — it's believing them once you do.",
      responses: [
        { label: "I'll think about that.", next: null       },
        { label: "Back.",                  next: 'greeting' },
      ],
    },
    others: {
      speaker: 'The Gatekeeper',
      text: "Everyone, eventually. Not in this place. But somewhere. Every person who ever lived came to a gate and had to decide what to ask of it.",
      responses: [
        { label: "What gates have you kept?", next: 'past_gates' },
        { label: "Back.",                     next: 'greeting'   },
      ],
    },
    past_gates: {
      speaker: 'The Gatekeeper',
      text: "Too many to count. Doors between things. Between who you were and who you're becoming. I've been keeping them a long time.",
      responses: [
        { label: "Are you always alone?", next: 'alone'   },
        { label: "Back.",                 next: 'greeting' },
      ],
    },
    alone: {
      speaker: 'The Gatekeeper',
      text: "No. The gate is always between two things. There's always someone on both sides. That's company enough.",
      responses: [
        { label: "That's a lonely kind of company.", next: null       },
        { label: "Back.",                            next: 'greeting' },
      ],
    },
    who: {
      speaker: 'The Gatekeeper',
      text: "Someone who has been here long enough to be useful, and not so long as to be unhelpful. A keeper of thresholds.",
      responses: [
        { label: "Thresholds?",    next: 'thresholds' },
        { label: "That's cryptic.", next: 'cryptic'   },
        { label: "Back.",           next: 'greeting'  },
      ],
    },
    thresholds: {
      speaker: 'The Gatekeeper',
      text: "Places where one thing ends and another begins. They need watching. Most people walk through them without noticing. That's fine — that's the point.",
      responses: [
        { label: "What happens if you notice?", next: 'notice'  },
        { label: "Back.",                        next: 'greeting' },
      ],
    },
    notice: {
      speaker: 'The Gatekeeper',
      text: "You slow down. You understand that crossing costs something. Not always much — sometimes just a breath, or a moment of attention. But always something.",
      responses: [
        { label: "What does crossing here cost?", next: 'cost'    },
        { label: "Back.",                         next: 'greeting' },
      ],
    },
    cost: {
      speaker: 'The Gatekeeper',
      text: "Nothing yet. You're still approaching. The cost comes when you decide where you're going.",
      responses: [
        { label: "Where am I going?", next: 'destination' },
        { label: "I'll take my time.", next: null          },
      ],
    },
    destination: {
      speaker: 'The Gatekeeper',
      text: "That's not something I can answer for you. But I think you already know. You're just waiting to trust it.",
      responses: [
        { label: "Maybe.", next: null       },
        { label: "Back.",  next: 'greeting' },
      ],
    },
    cryptic: {
      speaker: 'The Gatekeeper',
      text: "I've been told that. I don't mean to be. What I know doesn't translate cleanly. Some things resist shortcutting.",
      responses: [
        { label: "Try anyway.", next: 'try_anyway' },
        { label: "Back.",       next: 'greeting'   },
      ],
    },
    try_anyway: {
      speaker: 'The Gatekeeper',
      text: "I stand between what is and what could be. I note who passes. I hold the door. That's all.",
      responses: [
        { label: "That doesn't sound like 'all.'", next: null       },
        { label: "Thank you for trying.",          next: null       },
      ],
    },
    gate: {
      speaker: 'The Gatekeeper',
      text: "There's no visible structure. Gates don't need to be built. They form wherever something important happens often enough.",
      responses: [
        { label: "Something important happened here?", next: 'here'    },
        { label: "Back.",                              next: 'greeting' },
      ],
    },
    here: {
      speaker: 'The Gatekeeper',
      text: "People arrive. People leave. People decide things they've been avoiding deciding. Yes — that qualifies.",
      responses: [
        { label: "What will I decide?", next: 'decide'  },
        { label: "Back.",               next: 'greeting' },
      ],
    },
    decide: {
      speaker: 'The Gatekeeper',
      text: "Whether to stay curious. Whether the questions are worth the discomfort. Most people decide yes, eventually. A few decide no. Both are valid.",
      responses: [
        { label: "I choose yes.",    next: null },
        { label: "I need to think.", next: null },
      ],
    },
  },
}
