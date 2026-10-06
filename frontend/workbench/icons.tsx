// The workbench icon set. Every icon comes from one vector library (Lucide)
// and is referred to by a semantic name, so the whole application uses one
// style and an icon can be changed in one place. Icons inherit the current
// text color and are sized by design tokens.

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Pause,
  Redo2,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  BookOpen,
  Bug,
  ChevronRight,
  ChevronsDownUp,
  CircleCheck,
  CircleDot,
  CircleX,
  Cloud,
  CloudOff,
  Columns2,
  Command as CommandIcon,
  Cpu,
  FilePlus,
  Files,
  FlaskConical,
  Folder,
  FolderOpen,
  FolderPlus,
  Eye,
  EyeOff,
  Info,
  Footprints,
  GraduationCap,
  Keyboard,
  Lambda,
  ListTree,
  Maximize2,
  Minimize2,
  Monitor,
  Palette,
  PanelBottom,
  PanelLeft,
  Play,
  RefreshCw,
  Rows2,
  Save,
  Search,
  Server,
  Settings,
  Square,
  SquareTerminal,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  explorer: Files,
  search: Search,
  tests: FlaskConical,
  stepper: Footprints,
  interactions: SquareTerminal,
  problems: TriangleAlert,
  output: ListTree,
  run: Play,
  stop: Square,
  restart: RefreshCw,
  splitRight: Columns2,
  splitDown: Rows2,
  close: X,
  settings: Settings,
  themes: Palette,
  remote: Server,
  remoteOn: Cloud,
  remoteOff: CloudOff,
  local: Cpu,
  language: Lambda,
  student: GraduationCap,
  newFile: FilePlus,
  openFile: FolderOpen,
  folder: Folder,
  pause: Pause,
  stepOver: Redo2,
  stepInto: ArrowDownToLine,
  stepOut: ArrowUpFromLine,
  back: ArrowLeft,
  forward: ArrowRight,
  external: ExternalLink,
  globe: Globe,
  newFolder: FolderPlus,
  collapse: ChevronsDownUp,
  eye: Eye,
  eyeOff: EyeOff,
  info: Info,
  save: Save,
  command: CommandIcon,
  keyboard: Keyboard,
  docs: BookOpen,
  bug: Bug,
  sidebar: PanelLeft,
  panel: PanelBottom,
  maximize: Maximize2,
  restore: Minimize2,
  chevron: ChevronRight,
  pass: CircleCheck,
  fail: CircleX,
  dot: CircleDot,
  monitor: Monitor,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  const C = ICONS[name];
  return (
    <C
      size={size}
      strokeWidth={1.75}
      className={`icon${className ? ` ${className}` : ""}`}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable={false}
    />
  );
}
