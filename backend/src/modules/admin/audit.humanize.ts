import type { IAuditLog, AuditSeverity } from '../../models/index.js';

const ACTOR_LABELS: Record<string, string> = {
  user: 'User',
  responder: 'Responder',
  admin: 'Admin',
  system: 'System',
};

interface HumanizedAudit {
  module: string;
  description: string;
  severity: AuditSeverity;
}

const ACTION_RULES: Array<{
  match: RegExp;
  module: string;
  severity: AuditSeverity;
  describe: (log: IAuditLog) => string;
}> = [
  {
    match: /^emergency\.created$/,
    module: 'Emergency',
    severity: 'warning',
    describe: (l) => {
      const t = (l.meta as { type?: string } | undefined)?.type ?? 'emergency';
      return `${actor(l)} reported a ${prettify(t)} emergency.`;
    },
  },
  {
    match: /^emergency\.iot_keychain_created$/,
    module: 'Emergency',
    severity: 'critical',
    describe: (l) => `${actor(l)} triggered an emergency from the IoT keychain.`,
  },
  {
    match: /^emergency\.iot_device_created$/,
    module: 'Emergency',
    severity: 'critical',
    describe: (l) => `${actor(l)} triggered a fingerprint-authorized wearable emergency.`,
  },
  {
    match: /^emergency\.assigned$/,
    module: 'Emergency',
    severity: 'info',
    describe: (l) => `${actor(l)} assigned a responder to an emergency.`,
  },
  {
    match: /^emergency\.on_the_way$/,
    module: 'Emergency',
    severity: 'info',
    describe: (l) => `${actor(l)} marked the responder en route.`,
  },
  {
    match: /^emergency\.resolved$/,
    module: 'Emergency',
    severity: 'info',
    describe: (l) => {
      const note = (l.meta as { notes?: string } | undefined)?.notes;
      return `${actor(l)} resolved the emergency${note ? ` (${note})` : ''}.`;
    },
  },
  {
    match: /^emergency\.cancelled$/,
    module: 'Emergency',
    severity: 'warning',
    describe: (l) => `${actor(l)} cancelled an emergency request.`,
  },
  {
    match: /^emergency\.report_filed$/,
    module: 'Emergency',
    severity: 'info',
    describe: (l) => `${actor(l)} filed an incident report.`,
  },
  {
    match: /^ambulance_request\.created$/,
    module: 'Ambulance',
    severity: 'warning',
    describe: (l) => {
      const type = (l.meta as { requestType?: string } | undefined)?.requestType;
      return `${actor(l)} submitted ${type ? `a ${type}` : 'an'} ambulance request.`;
    },
  },
  {
    match: /^ambulance_request\.approved$/,
    module: 'Ambulance',
    severity: 'info',
    describe: (l) => `${actor(l)} approved an ambulance request.`,
  },
  {
    match: /^ambulance_request\.rejected$/,
    module: 'Ambulance',
    severity: 'warning',
    describe: (l) => {
      const reason = (l.meta as { reason?: string } | undefined)?.reason;
      return `${actor(l)} rejected an ambulance request${reason ? `: ${reason}` : '.'}`;
    },
  },
  {
    match: /^ambulance_request\.assigned$/,
    module: 'Ambulance',
    severity: 'info',
    describe: (l) => {
      const meta = l.meta as { unitNumber?: number } | undefined;
      return `${actor(l)} assigned ambulance Unit ${meta?.unitNumber ?? ''} to a request.`.trim();
    },
  },
  {
    match: /^ambulance_request\.on_the_way$/,
    module: 'Ambulance',
    severity: 'info',
    describe: (l) => `${actor(l)} marked the ambulance en route.`,
  },
  {
    match: /^ambulance_request\.arrived_pickup$/,
    module: 'Ambulance',
    severity: 'info',
    describe: (l) => `${actor(l)} marked arrival at pickup.`,
  },
  {
    match: /^ambulance_request\.patient_onboard$/,
    module: 'Ambulance',
    severity: 'info',
    describe: (l) => `${actor(l)} marked the patient picked up.`,
  },
  {
    match: /^ambulance_request\.completed$/,
    module: 'Ambulance',
    severity: 'info',
    describe: (l) => `${actor(l)} completed an ambulance transport.`,
  },
  {
    match: /^ambulance_request\.cancelled$/,
    module: 'Ambulance',
    severity: 'warning',
    describe: (l) => `${actor(l)} cancelled an ambulance request.`,
  },
  {
    match: /^user\.approved$/,
    module: 'Approvals',
    severity: 'info',
    describe: (l) => `${actor(l)} approved a user registration.`,
  },
  {
    match: /^user\.rejected$/,
    module: 'Approvals',
    severity: 'warning',
    describe: (l) => {
      const reason = (l.meta as { reason?: string } | undefined)?.reason;
      return `${actor(l)} rejected a user registration${reason ? `: ${reason}` : '.'}`;
    },
  },
  {
    match: /^responder\.approved$/,
    module: 'Approvals',
    severity: 'info',
    describe: (l) => `${actor(l)} approved a responder registration.`,
  },
  {
    match: /^responder\.rejected$/,
    module: 'Approvals',
    severity: 'warning',
    describe: (l) => {
      const reason = (l.meta as { reason?: string } | undefined)?.reason;
      return `${actor(l)} rejected a responder registration${reason ? `: ${reason}` : '.'}`;
    },
  },
  {
    match: /^responder\.created_by_admin$/,
    module: 'Responders',
    severity: 'info',
    describe: (l) => `${actor(l)} created a new responder.`,
  },
  {
    match: /^ambulance_unit\.created$/,
    module: 'Settings',
    severity: 'info',
    describe: (l) => `${actor(l)} added a new ambulance unit.`,
  },
  {
    match: /^ambulance_unit\.updated$/,
    module: 'Settings',
    severity: 'info',
    describe: (l) => `${actor(l)} updated an ambulance unit.`,
  },
  {
    match: /^ambulance_unit\.deleted$/,
    module: 'Settings',
    severity: 'warning',
    describe: (l) => `${actor(l)} deleted an ambulance unit.`,
  },
];

function actor(log: IAuditLog): string {
  const role = ACTOR_LABELS[log.actorRole] ?? 'System';
  return log.actorName ? `${role} ${log.actorName}` : role;
}

function prettify(s: string): string {
  return s.replace(/_/g, ' ');
}

export function humanizeAudit(log: IAuditLog): HumanizedAudit {
  if (log.description && log.module && log.severity) {
    return { description: log.description, module: log.module, severity: log.severity };
  }
  for (const rule of ACTION_RULES) {
    if (rule.match.test(log.action)) {
      return {
        module: log.module ?? rule.module,
        severity: log.severity ?? rule.severity,
        description: log.description ?? rule.describe(log),
      };
    }
  }
  return {
    module: log.module ?? guessModule(log.action),
    severity: log.severity ?? 'info',
    description:
      log.description ??
      `${actor(log)} performed ${prettify(log.action)}${log.targetType ? ` on ${log.targetType}` : ''}.`,
  };
}

function guessModule(action: string): string {
  const head = action.split('.')[0] ?? '';
  const map: Record<string, string> = {
    emergency: 'Emergency',
    ambulance_request: 'Ambulance',
    ambulance_unit: 'Settings',
    user: 'Approvals',
    responder: 'Responders',
    auth: 'Authentication',
  };
  return map[head] ?? 'System';
}

export const KNOWN_MODULES = [
  'Emergency',
  'Ambulance',
  'Approvals',
  'Responders',
  'Settings',
  'Authentication',
  'System',
] as const;
