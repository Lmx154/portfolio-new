import type { IconName } from './components/icons';

/**
 * Single source of truth for the CMS's navigation and the task guides shown in
 * the Help tab. App (sidebar), Help (guide cards), and Dashboard (quick actions
 * + chips) all read from here so labels, colors, and icons never drift apart.
 */

export type Section =
  | 'dashboard'
  | 'home' | 'blog' | 'projects' | 'community' | 'about'
  | 'media'
  | 'preview' | 'publish'
  | 'help';

export type NavItem = { key: Section; label: string; icon: IconName };
export type NavGroup = { label: string; color: string; items: NavItem[] };

/** Each group has a signature accent color used across the chrome. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Start',
    color: '#38bdf8', // sky
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    ],
  },
  {
    label: 'Content',
    color: '#fbbf24', // amber
    items: [
      { key: 'home', label: 'Home', icon: 'home' },
      { key: 'blog', label: 'Blog', icon: 'blog' },
      { key: 'projects', label: 'Projects', icon: 'projects' },
      { key: 'community', label: 'Community', icon: 'community' },
      { key: 'about', label: 'About', icon: 'about' },
    ],
  },
  {
    label: 'Assets',
    color: '#2dd4bf', // teal
    items: [
      { key: 'media', label: 'Media', icon: 'media' },
    ],
  },
  {
    label: 'Ship',
    color: '#4ade80', // green
    items: [
      { key: 'preview', label: 'Preview', icon: 'preview' },
      { key: 'publish', label: 'Publish', icon: 'publish' },
    ],
  },
  {
    label: 'Help',
    color: '#a78bfa', // violet
    items: [
      { key: 'help', label: 'Help', icon: 'help' },
    ],
  },
];

/** key -> label / icon / group accent color, derived once from NAV_GROUPS. */
export const SECTION_LABEL = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])),
) as Record<Section, string>;

export const SECTION_ICON = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.icon])),
) as Record<Section, IconName>;

export const SECTION_COLOR = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.key, g.color])),
) as Record<Section, string>;

/** A "how do I…" task guide rendered in the Help tab. */
export type Guide = {
  id: string;
  title: string;
  /** Tabs this task touches; the first is the primary "Go to" target. */
  tabs: Section[];
  steps: string[];
};

export const GUIDES: Guide[] = [
  {
    id: 'write-post',
    title: 'Write a blog post',
    tabs: ['blog', 'media', 'preview'],
    steps: [
      'Open Blog and click “New post”. Type a title; the slug (the post’s folder and URL) fills in for you. Click “Create draft”.',
      'Fill in the Metadata: status, date (YYYY-MM-DD), display date, read time, excerpt, tags, and a cover image. The excerpt is the short description shown on post cards.',
      'Under “Content blocks”, pick a block type (heading, paragraph, list, image, video, code, quote, callout, divider) and click “Add block”. Paragraphs, headings and list items accept inline markdown such as **bold** and [links](https://…).',
      'Use the arrows on a block to move it, the copy button to duplicate it, and the delete button to remove it. Image blocks have an Alt text field — fill it in so the post is accessible.',
      'Switch the Edit / Preview toggle at the top to see the post rendered, then click Save.',
    ],
  },
  {
    id: 'publish-post',
    title: 'Turn a draft into a published post',
    tabs: ['blog', 'publish'],
    steps: [
      'Open the post from the Blog list. Drafts are only visible in the CMS; the website shows published posts.',
      'A published post needs a date and at least one block. Set Status to “published”, fill in the date, and click Save — the CMS refuses to save an invalid post and tells you what is missing.',
      'Add a cover image and an excerpt so the post card looks complete (the Dashboard warns you if they are missing).',
      'Check it in the Preview tab, then go to Publish to put it on the live site.',
    ],
  },
  {
    id: 'add-project',
    title: 'Add or edit a project',
    tabs: ['projects', 'media'],
    steps: [
      'Open Projects. Click “＋ New project”, type a Title, check the “Id (file name)” (filled in from the title; it can’t be changed later), and click “Create”. Existing projects are listed as collapsible cards.',
      'Fill in Title, Status, Image, Description, Tags, and the optional GitHub and live-demo URLs.',
      'Use the search box to find a project, the collapse/expand-all button to tidy the list, and the ↑ and ↓ arrows on each card to set the order (the order shown is the order on the homepage; the arrows pause while a search is active). Use the select button to tick several cards and delete them in one go.',
      'Click Save. Nothing is written to disk until you do — reordering also only takes effect on Save.',
    ],
  },
  {
    id: 'project-media',
    title: 'Build a project’s media gallery (images, videos, 3D models)',
    tabs: ['projects', 'media'],
    steps: [
      'In a project, find “Media gallery”. When it has items it replaces the single image and 3D model on the site.',
      'Click “Add media”, choose the type (image, video, or 3D model), then type a path such as /photo.webp or use “Import…” to bring in a file from your computer.',
      'Add a caption if you like. For images, add alt text so the picture is accessible.',
      'Use the up and down arrows to change the order — the first item is what visitors see first — and ✕ to remove one.',
      'Large models are best converted in the Media tab first (“Convert for web”) so the page loads quickly. Click Save when done.',
    ],
  },
  {
    id: 'community',
    title: 'Edit the Community tiles',
    tabs: ['community', 'media'],
    steps: [
      'Open Community. Each tile is one photo with a title, alt text and description.',
      'Click “New tile” to add one, then choose its image (Choose…, Import…, or Crop…), and fill in Title, Alt text and Description.',
      'To make a tile a small gallery, use “Add media” under Gallery (optional). Add images, or videos: import a video file, or paste a YouTube link (youtube.com/watch, youtu.be or youtube.com/shorts). Tiles with a gallery show a badge and open a lightbox on the site; tiles without one open the single photo as before.',
      'Search to find a tile, collapse or expand them all with one button, and use the up and down arrows to reorder. Use the select button to tick several tiles and delete them together.',
      'Click Save to write the changes.',
    ],
  },
  {
    id: 'about-resume',
    title: 'Update the About page and resume',
    tabs: ['about', 'media'],
    steps: [
      'Open About. Edit the section title, profile image and its alt text, and your bio paragraphs (add or remove paragraphs freely).',
      'Edit the personality traits (icon, title, description) and the Education and Focus lists.',
      'Under Resume, click “Import PDF…” to copy a PDF into the site — the path fills in automatically. Set the download filename and the button label visitors see.',
      'Click Save. Use Preview to check how it looks.',
    ],
  },
  {
    id: 'home-text',
    title: 'Change the home page and site text',
    tabs: ['home', 'preview'],
    steps: [
      'Open Home. “Title page” holds your name, role and the headline lines shown in the hero.',
      'Under “Call-to-action buttons”, edit each button’s label and choose which section of the page it scrolls to, or add a new button.',
      'Links sets your GitHub, LinkedIn, X and email addresses used across the header and footer. Footer sets the copyright lines.',
      'Click Save, then open Preview to see the result.',
    ],
  },
  {
    id: 'media-import',
    title: 'Import media and keep it organized',
    tabs: ['media'],
    steps: [
      'Open Media and use the import buttons: image, video, 3D model, PDF, or any file. Everything goes into the shared public folder.',
      'Imports are converted for the web automatically: images become WebP (max 1920px), videos become 1080p MP4, 3D models become GLB. This needs ffmpeg and Node.js — the Dashboard and this screen warn you if either is missing.',
      'To crop an image, use “Crop…” next to any image field in an editor. It saves a new WebP beside the original.',
      'Each file shows where it is used. Use the filter chips to jump to one area, or to “Unused” files that nothing references — those are safe to delete. Files flagged “large” (images over about 700 KB, clips over about 12 MB) slow the site down; re-import a smaller version.',
      'Raw OBJ/STEP files under “Source files” are not deployed. Click “Convert for web” to make a small GLB, and click any model to view it in 3D.',
    ],
  },
  {
    id: 'preview-server',
    title: 'Preview the site locally',
    tabs: ['preview'],
    steps: [
      'Open Preview and flip the switch at the top to start the local dev server. The first start can take a few seconds.',
      'The site appears inside the CMS. Type a path in the address bar (for example / or /blog/my-post or /#projects) and press Enter or click Reload.',
      'Saved changes show up after a reload. Flip the switch off when you are done.',
      'If the switch gets stuck or another program is using the port, click “Kill port 4321” and start it again.',
    ],
  },
  {
    id: 'publish',
    title: 'Publish your changes',
    tabs: ['publish', 'preview'],
    steps: [
      'Save every editor first — Publish only sees what is written to disk.',
      'Open Publish. The status line says whether you have changes ready or updates waiting from another computer.',
      'Optionally describe your change, then click “Publish changes”. In one step the CMS commits, merges in anything from the remote, and pushes so the site redeploys.',
      'Nothing is ever forced: if something goes wrong the error says so and your work is untouched. Click “Check for updates” and try again.',
    ],
  },
  {
    id: 'undo-publish',
    title: 'Undo a published change',
    tabs: ['publish'],
    steps: [
      'Open Publish, find “Recent changes”, and click Show to list them.',
      'Click “Undo…” on the change you want to reverse, then confirm with “Undo & publish”.',
      'This adds a new change that reverses the old one — it never deletes history or touches other work.',
    ],
  },
  {
    id: 'merge-conflicts',
    title: 'Resolve merge conflicts',
    tabs: ['publish'],
    steps: [
      'If you edited the same content on two computers, Publish stops at a “Merge changes” screen listing the files that conflict.',
      'For each file choose “Keep mine” or “Keep theirs”, or ask the merge assistant to propose a combined version and click Apply on the one you like.',
      'The assistant is optional and runs on your own machine with Ollama (start it with “ollama serve” and pick a model). If it is offline you can still use Keep mine / Keep theirs.',
      'When every file is resolved, click “Finish merge & publish”. Click “Cancel merge” instead to go back to how things were.',
    ],
  },
  {
    id: 'theme',
    title: 'Switch between light and dark mode',
    tabs: ['dashboard'],
    steps: [
      'Click the sun or moon button at the bottom of the left sidebar.',
      'Your choice is remembered the next time you open the CMS.',
      'The theme only affects the CMS itself, not the public website.',
    ],
  },
];
