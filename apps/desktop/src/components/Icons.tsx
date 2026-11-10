/** Stroke icons, drawn inline so they follow the text colour. */
type P = { size?: number };
const base = (size = 16) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const OrbiIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(24 12 12)" />
    <circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none" />
    <circle cx="18.6" cy="16.6" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);
export const ChatIcon = ({ size }: P) => (<svg {...base(size)}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>);
export const BrainIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="7" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8.3 7h7.4M7.3 8.2l3.6 7.6M16.8 9.2l-3.6 6.6" /></svg>);
export const DialIcon = ({ size }: P) => (<svg {...base(size)}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>);
export const PlusIcon = ({ size }: P) => (<svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>);
export const CheckIcon = ({ size }: P) => (<svg {...base(size)}><path d="M5 12l5 5 9-10" /></svg>);
export const XIcon = ({ size }: P) => (<svg {...base(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const AlertIcon = ({ size }: P) => (<svg {...base(size)}><path d="M12 3l9.5 17h-19L12 3z" /><path d="M12 10v4M12 17.5v.5" /></svg>);
export const ToolIcon = ({ size }: P) => (<svg {...base(size)}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></svg>);
export const StopIcon = ({ size }: P) => (<svg {...base(size)}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>);
export const SendIcon = ({ size }: P) => (<svg {...base(size)}><path d="M5 12l14-7-5 14-2.5-5.5L5 12z" /></svg>);
export const BulbIcon = ({ size }: P) => (<svg {...base(size)}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg>);
export const LinkIcon = ({ size }: P) => (<svg {...base(size)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>);
export const ClockIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const RecordIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" /></svg>);
export const MicIcon = ({ size }: P) => (<svg {...base(size)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
export const MicOffIcon = ({ size }: P) => (<svg {...base(size)}><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.6 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" /></svg>);
export const GlobeIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></svg>);
export const KeyIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></svg>);
export const CopyIcon = ({ size }: P) => (<svg {...base(size)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>);
export const PencilIcon = ({ size }: P) => (<svg {...base(size)}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M14 6l4 4" /></svg>);
export const TrashIcon = ({ size }: P) => (<svg {...base(size)}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>);
export const UpIcon = ({ size }: P) => (<svg {...base(size)}><path d="M6 14l6-6 6 6" /></svg>);
export const DownIcon = ({ size }: P) => (<svg {...base(size)}><path d="M6 10l6 6 6-6" /></svg>);
export const PlugIcon = ({ size }: P) => (<svg {...base(size)}><path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5" /></svg>);
export const PipelineIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="5" cy="6" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M7.5 6h9M17.5 8l-4 8M6.5 8l4 8" /></svg>);
