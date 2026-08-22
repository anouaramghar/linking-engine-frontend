/**
 * Strobi definition adapted from Bible Strong Avatar Lab's bundled studio
 * document. Upstream source: https://github.com/smontlouis/bible-strong-avatar-lab
 * The Avatar Lab packages and source are licensed AGPL-3.0-only.
 */
import type { AvatarDefinition } from "@bible-strong/avatar-core"

export const agentAvatarDefinition = {
  "schema": "bible-strong/avatar-definition",
  "schemaVersion": 1,
  "name": "Strobi",
  "body": {
    "primary": {
      "type": "sphere",
      "width": 240,
      "height": 240,
      "depth": 240.03671875,
      "roundness": 1
    },
    "nodes": []
  },
  "colors": {
    "body": "#5b7fe5",
    "eyes": "#111316"
  },
  "expressions": {
    "neutral": {
      "head": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "eyes": {
        "left": {
          "width": 20,
          "height": 50,
          "x": 0,
          "y": -7,
          "angle": 0
        },
        "right": {
          "width": 20,
          "height": 50,
          "x": 0,
          "y": -7,
          "angle": 0
        },
        "spacing": 35
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "upward-side-glance": {
      "head": {
        "x": 7.3,
        "y": 27.8,
        "z": -16.1
      },
      "eyes": {
        "left": {
          "width": 22.501171874999997,
          "height": 42.377734374999996,
          "x": 0,
          "y": -20.5,
          "angle": 0
        },
        "right": {
          "width": 22.501171874999997,
          "height": 42.377734374999996,
          "x": 0,
          "y": -20.5,
          "angle": 0
        },
        "spacing": 54.3
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "downward-gaze": {
      "head": {
        "x": -15.057812500000004,
        "y": 0.14296874999999964,
        "z": -14.549218750000001
      },
      "eyes": {
        "left": {
          "width": 22.401171875,
          "height": 54.5703125,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "right": {
          "width": 22.401171875,
          "height": 54.5703125,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "spacing": 57.7
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "skeptical-right": {
      "head": {
        "x": -16.528515625,
        "y": -3.7679687499999996,
        "z": -13.7296875
      },
      "eyes": {
        "left": {
          "width": 23.090625,
          "height": 57.6796875,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "right": {
          "width": 49.924609375,
          "height": 12.431640625,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "spacing": 56.3
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "surprised-left": {
      "head": {
        "x": 2.9468749999999986,
        "y": -16.051171875,
        "z": -20.916015625
      },
      "eyes": {
        "left": {
          "width": 51.68336723153048,
          "height": 51.74054108796297,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "right": {
          "width": 51.68336723153048,
          "height": 51.74054108796297,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "spacing": 70.9
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "angry-right": {
      "head": {
        "x": 8.063671874999999,
        "y": 17.626562500000002,
        "z": -11.116796874999999
      },
      "eyes": {
        "left": {
          "width": 20.908203124999996,
          "height": 40.40078125,
          "x": 0,
          "y": 0,
          "angle": -30.865625
        },
        "right": {
          "width": 20.908203124999996,
          "height": 40.40078125,
          "x": 0,
          "y": 0,
          "angle": 28.781640625
        },
        "spacing": 52.059765625
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "curious-left": {
      "head": {
        "x": -12.303515625,
        "y": -17.601171875,
        "z": 5.9109375
      },
      "eyes": {
        "left": {
          "width": 20.605859374999994,
          "height": 47.769921874999994,
          "x": 0,
          "y": 0,
          "angle": 23.523046875000002
        },
        "right": {
          "width": 20.605859374999994,
          "height": 47.769921874999994,
          "x": 0,
          "y": 0,
          "angle": -24.042578125000002
        },
        "spacing": 54.9
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "attentive-left": {
      "head": {
        "x": 1.43359375,
        "y": 6.194140624999999,
        "z": 10.56015625
      },
      "eyes": {
        "left": {
          "width": 23.836718749999996,
          "height": 58.130078125,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "right": {
          "width": 23.836718749999996,
          "height": 58.130078125,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "spacing": 56.8
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "joyful-wide": {
      "head": {
        "x": -2.092968750000001,
        "y": -15.899609374999999,
        "z": -14.469921875
      },
      "eyes": {
        "left": {
          "width": 34.20086765973213,
          "height": 85.330859375,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "right": {
          "width": 34.20086765973213,
          "height": 83.17775668160692,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "spacing": 59.414453125
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "joyful-down-right": {
      "head": {
        "x": -15.287109375000002,
        "y": 15.006640625,
        "z": 12.787890625
      },
      "eyes": {
        "left": {
          "width": 31.253906249999996,
          "height": 76.720703125,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "right": {
          "width": 31.253906249999996,
          "height": 76.720703125,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "spacing": 68.7
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "skeptical-left": {
      "head": {
        "x": 3.5292968750000004,
        "y": -7.0765625,
        "z": 9.830078125
      },
      "eyes": {
        "left": {
          "width": 24.306250000000002,
          "height": 59.281640624999994,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "right": {
          "width": 48.92421875000001,
          "height": 13.408203124999996,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "spacing": 62.218359375
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "far-right-glance": {
      "head": {
        "x": 0.31914062500000184,
        "y": 35.307421874999996,
        "z": -10.904296875
      },
      "eyes": {
        "left": {
          "width": 22.4609375,
          "height": 39.820703125,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "right": {
          "width": 22.4609375,
          "height": 39.820703125,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "spacing": 53.9
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "angry-left": {
      "head": {
        "x": -14.750781250000001,
        "y": -19.350000000000005,
        "z": 5.631640624999998
      },
      "eyes": {
        "left": {
          "width": 19.602343750000003,
          "height": 48.63984375,
          "x": 0,
          "y": 0,
          "angle": -27.606640625
        },
        "right": {
          "width": 19.602343750000003,
          "height": 48.63984375,
          "x": 0,
          "y": 0,
          "angle": 26.1484375
        },
        "spacing": 55.1
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "playful-right": {
      "head": {
        "x": -4.3953125,
        "y": 14.07265625,
        "z": -16.126171874999997
      },
      "eyes": {
        "left": {
          "width": 19.045145681988206,
          "height": 43.370703125,
          "x": 0,
          "y": 0,
          "angle": 26.2921875
        },
        "right": {
          "width": 19.045145681988206,
          "height": 43.370703125,
          "x": 0,
          "y": 0,
          "angle": -20.249218750000004
        },
        "spacing": 51.731249999999996
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "gentle-downward-gaze": {
      "head": {
        "x": -6.077734375000001,
        "y": -11.03515625,
        "z": -13.965625000000001
      },
      "eyes": {
        "left": {
          "width": 23.045703125,
          "height": 58.68515625,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "right": {
          "width": 23.045703125,
          "height": 58.68515625,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "spacing": 56.2
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    },
    "surprised-wide-left": {
      "head": {
        "x": -5.428125,
        "y": -11.71328125,
        "z": -13.472265625000002
      },
      "eyes": {
        "left": {
          "width": 51.4,
          "height": 50.1,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "right": {
          "width": 50.5,
          "height": 49.4,
          "x": 0,
          "y": 0,
          "angle": 0
        },
        "spacing": 69
      },
      "perspective": 1,
      "motion": {
        "eyes": "none",
        "body": "none"
      }
    }
  },
  "expressionOrder": [
    "neutral",
    "upward-side-glance",
    "downward-gaze",
    "skeptical-right",
    "surprised-left",
    "angry-right",
    "curious-left",
    "attentive-left",
    "joyful-wide",
    "joyful-down-right",
    "skeptical-left",
    "far-right-glance",
    "angry-left",
    "playful-right",
    "gentle-downward-gaze",
    "surprised-wide-left"
  ],
  "animations": {
    "idle": {
      "playbackMode": "loop",
      "steps": [
        {
          "expression": "curious-left",
          "holdMs": 6400,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "attentive-left",
          "holdMs": 4200,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "upward-side-glance",
          "holdMs": 2000,
          "transitionMs": 500,
          "transition": "smooth"
        }
      ],
      "blink": {
        "enabled": true,
        "initialDelayMs": 2600,
        "minIntervalMs": 3400,
        "maxIntervalMs": 6200,
        "durationMs": 280
      },
      "metadata": {
        "label": "idle",
        "description": "Regard principalement à gauche, micro-mouvements lents et clignement rare.",
        "group": "Cycle de vie"
      }
    },
    "listening": {
      "playbackMode": "loop",
      "steps": [
        {
          "expression": "attentive-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "downward-gaze",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "gentle-downward-gaze",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        }
      ],
      "blink": {
        "enabled": true,
        "initialDelayMs": 3200,
        "minIntervalMs": 4800,
        "maxIntervalMs": 7200,
        "durationMs": 240
      },
      "metadata": {
        "label": "listening",
        "description": "Expressions 10, 01 et 19, regard stable et clignement attentif.",
        "group": "Cycle de vie"
      }
    },
    "thinking": {
      "playbackMode": "loop",
      "steps": [
        {
          "expression": "curious-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "angry-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "skeptical-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "playful-right",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "skeptical-right",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        }
      ],
      "blink": {
        "enabled": true,
        "initialDelayMs": 2100,
        "minIntervalMs": 2800,
        "maxIntervalMs": 5000,
        "durationMs": 260
      },
      "metadata": {
        "label": "thinking",
        "description": "Regard haut et latéral, expressions asymétriques et changements fréquents.",
        "group": "Cycle de vie"
      }
    },
    "working": {
      "playbackMode": "loop",
      "steps": [
        {
          "expression": "angry-right",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "angry-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "joyful-wide",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "attentive-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        }
      ],
      "blink": {
        "enabled": true,
        "initialDelayMs": 2100,
        "minIntervalMs": 2800,
        "maxIntervalMs": 5000,
        "durationMs": 260
      },
      "metadata": {
        "label": "working",
        "description": "Rythme régulier et expressions concentrées.",
        "group": "Cycle de vie"
      }
    },
    "happy": {
      "playbackMode": "loop",
      "steps": [
        {
          "expression": "joyful-down-right",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "joyful-wide",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "playful-right",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "gentle-downward-gaze",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        }
      ],
      "blink": {
        "enabled": true,
        "initialDelayMs": 2100,
        "minIntervalMs": 2800,
        "maxIntervalMs": 5000,
        "durationMs": 260
      },
      "metadata": {
        "label": "happy",
        "description": "Cet état enchaîne un pool de presets et des clignements.",
        "group": "Réactions"
      }
    },
    "curious": {
      "playbackMode": "loop",
      "steps": [
        {
          "expression": "surprised-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "surprised-wide-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "upward-side-glance",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "far-right-glance",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        }
      ],
      "blink": {
        "enabled": true,
        "initialDelayMs": 2100,
        "minIntervalMs": 2800,
        "maxIntervalMs": 5000,
        "durationMs": 260
      },
      "metadata": {
        "label": "curious",
        "description": "Inclinaisons et forte asymétrie.",
        "group": "Réactions"
      }
    },
    "surprised": {
      "playbackMode": "loop",
      "steps": [
        {
          "expression": "surprised-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "surprised-wide-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        }
      ],
      "blink": {
        "enabled": true,
        "initialDelayMs": 1200,
        "minIntervalMs": 1800,
        "maxIntervalMs": 3600,
        "durationMs": 220
      },
      "metadata": {
        "label": "surprised",
        "description": "Cet état enchaîne un pool de presets et des clignements.",
        "group": "Réactions"
      }
    },
    "celebrate": {
      "playbackMode": "loop",
      "steps": [
        {
          "expression": "joyful-down-right",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "curious-left",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        },
        {
          "expression": "playful-right",
          "holdMs": 2300,
          "transitionMs": 500,
          "transition": "smooth"
        }
      ],
      "blink": {
        "enabled": true,
        "initialDelayMs": 1200,
        "minIntervalMs": 1800,
        "maxIntervalMs": 3600,
        "durationMs": 220
      },
      "metadata": {
        "label": "celebrate",
        "description": "Cet état enchaîne un pool de presets et des clignements.",
        "group": "Réactions"
      }
    }
  },
  "animationOrder": [
    "idle",
    "listening",
    "thinking",
    "working",
    "happy",
    "curious",
    "surprised",
    "celebrate"
  ]
} satisfies AvatarDefinition;
