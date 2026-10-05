/**
 * Time zones for client meetings. Reps type the time the client agreed to, in the
 * client's zone; everything is stored as an instant and shown in any zone.
 */
import { splitPhones } from './phones';

export interface Zone { id: string; label: string; short: string; color: string }

export const ZONES: Zone[] = [
  { id: 'America/New_York', label: 'Eastern', short: 'ET', color: '#7C5CFF' },
  { id: 'America/Chicago', label: 'Central', short: 'CT', color: '#0A84FF' },
  { id: 'America/Denver', label: 'Mountain', short: 'MT', color: '#30C46C' },
  { id: 'America/Phoenix', label: 'Arizona', short: 'AZ', color: '#34D3A0' },
  { id: 'America/Los_Angeles', label: 'Pacific', short: 'PT', color: '#FF9A6B' },
  { id: 'America/Anchorage', label: 'Alaska', short: 'AKT', color: '#5AB8FF' },
  { id: 'Pacific/Honolulu', label: 'Hawaii', short: 'HT', color: '#FF6B9A' },
  { id: 'America/Halifax', label: 'Atlantic', short: 'AT', color: '#A996FF' },
  { id: 'America/St_Johns', label: 'Newfoundland', short: 'NT', color: '#8E8AA0' },
  { id: 'Europe/London', label: 'UK', short: 'UK', color: '#FF453A' },
  { id: 'Europe/Dublin', label: 'Ireland', short: 'IE', color: '#2FB98C' },
  { id: 'Europe/Berlin', label: 'Central Europe', short: 'CET', color: '#FFC23A' },
  { id: 'Asia/Dubai', label: 'Gulf (UAE)', short: 'GST', color: '#F08A4B' },
  { id: 'Asia/Karachi', label: 'Pakistan', short: 'PKT', color: '#0B0B10' },
  { id: 'Asia/Kolkata', label: 'India', short: 'IST', color: '#D9773F' },
  { id: 'Australia/Sydney', label: 'Sydney', short: 'AET', color: '#1FA67C' },
  { id: 'Australia/Perth', label: 'Perth', short: 'AWT', color: '#8F74FF' },
  { id: 'Pacific/Auckland', label: 'New Zealand', short: 'NZT', color: '#5AB8FF' },
];
export const PKT = 'Asia/Karachi';

export const zoneMeta = (id: string | null | undefined): Zone =>
  ZONES.find((z) => z.id === id) ?? { id: id ?? PKT, label: id ? id.split('/').pop()!.replace(/_/g, ' ') : 'Pakistan', short: '', color: '#8E8AA0' };

/* ---------------------------------------------------------- guessing the zone */
// North American area codes by zone (where a state spans two, the larger side wins).
const AREA: Record<string, string> = {};
const add = (tz: string, codes: string) => codes.split(/\s+/).forEach((c) => { AREA[c] = tz; });
add('America/New_York', `
  203 475 860 959 302 202 771 239 305 321 324 352 386 407 448 561 645 656 689 727 728 754 772 786 813 850 863 904 941 954
  229 404 470 478 678 706 762 770 912 943 207 227 240 301 410 443 667 339 351 413 508 617 774 781 857 978
  231 248 269 313 517 586 616 679 734 810 906 947 989 603 201 551 609 640 732 848 856 862 908 973
  212 315 329 332 347 363 516 518 585 607 624 631 646 680 716 718 838 845 914 917 929 934
  252 336 472 704 743 828 910 919 980 984 216 220 234 283 326 330 380 419 436 440 513 567 614 740 937
  215 223 267 272 412 445 484 570 582 610 717 724 814 835 878 401 803 821 839 843 854 864 802
  276 434 540 571 703 757 804 826 948 304 681 260 317 463 574 765 812 930 502 606 859 423 865
  226 249 289 343 365 382 416 437 519 548 613 647 683 705 742 753 905 263 354 367 418 438 450 468 514 579 581 819 873`);
add('America/Chicago', `
  205 251 256 334 659 938 327 479 501 870 217 224 309 312 331 447 464 618 630 708 730 773 779 815 847 861 872
  319 515 563 641 712 316 620 785 913 225 318 337 504 985 218 320 507 612 651 763 952 228 601 662 769
  314 417 557 573 636 660 816 975 402 531 308 701 405 539 572 580 918 605 615 629 731 901 931
  210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 936 940 945 956 972 979
  262 274 414 534 608 715 920 270 364 219 204 431 584 306 639`);
add('America/Denver', '303 719 720 970 983 208 986 406 505 575 385 435 801 307 915 368 403 587 780 825 867');
add('America/Phoenix', '480 520 602 623 928');
add('America/Los_Angeles', `
  209 213 279 310 323 341 350 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 747 760 805 818 820
  831 840 858 909 916 925 949 951 702 725 775 458 503 541 971 206 253 360 425 509 564 236 250 257 604 672 778`);
add('America/Anchorage', '907');
add('Pacific/Honolulu', '808');
add('America/Halifax', '506 782 902 787 939');
add('America/St_Johns', '709');

const COUNTRY_ZONE: [RegExp, string][] = [
  [/united kingdom|^uk$|england|scotland|wales|britain/i, 'Europe/London'],
  [/ireland/i, 'Europe/Dublin'],
  [/united arab emirates|^uae$|dubai|abu dhabi|qatar|oman/i, 'Asia/Dubai'],
  [/pakistan/i, 'Asia/Karachi'],
  [/india/i, 'Asia/Kolkata'],
  [/new zealand/i, 'Pacific/Auckland'],
  [/australia/i, 'Australia/Sydney'],
  [/germany|france|spain|italy|netherlands|belgium|sweden|norway|denmark|poland|austria|switzerland/i, 'Europe/Berlin'],
];
const PREFIX_ZONE: [string, string][] = [
  ['44', 'Europe/London'], ['353', 'Europe/Dublin'], ['971', 'Asia/Dubai'], ['974', 'Asia/Dubai'], ['92', 'Asia/Karachi'],
  ['91', 'Asia/Kolkata'], ['64', 'Pacific/Auckland'], ['61', 'Australia/Sydney'], ['49', 'Europe/Berlin'], ['33', 'Europe/Berlin'],
];

/** Best guess at the client's zone from their number (area code) and country. */
export function guessZone(phone: string | null | undefined, country: string | null | undefined): { id: string; why: string } | null {
  const first = splitPhones(phone)[0] ?? '';
  const raw = first.trim();
  const d = raw.replace(/\D/g, '');
  const intl = raw.startsWith('+') || d.startsWith('00') ? d.replace(/^00/, '') : null;
  const nanp = intl ? (intl.startsWith('1') ? intl.slice(1) : null) : d.length === 11 && d.startsWith('1') ? d.slice(1) : d.length === 10 ? d : null;
  if (nanp && AREA[nanp.slice(0, 3)]) return { id: AREA[nanp.slice(0, 3)], why: `area code ${nanp.slice(0, 3)}` };
  if (intl) {
    const hit = PREFIX_ZONE.find(([p]) => intl.startsWith(p));
    if (hit) return { id: hit[1], why: `+${hit[0]} number` };
  }
  const c = (country ?? '').trim();
  const byCountry = COUNTRY_ZONE.find(([re]) => re.test(c));
  if (byCountry) return { id: byCountry[1], why: c };
  if (/united states|^usa?$|canada|america/i.test(c)) return { id: 'America/New_York', why: `${c} — check the zone` };
  return null;
}

/* --------------------------------------------------------- converting times */
interface Parts { y: number; m: number; d: number; h: number; mi: number; s: number; wd: number }
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsIn(date: Date, tz: string): Parts {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd };
}
const offsetMs = (utc: number, tz: string) => {
  const p = partsIn(new Date(utc), tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - utc;
};

/** "2026-10-07T15:00" typed in America/Chicago → the UTC instant (ISO). */
export function zonedInputToISO(local: string, tz: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = guess - offsetMs(guess, tz);
  const again = guess - offsetMs(utc, tz);
  if (again !== utc) utc = again;
  return new Date(utc).toISOString();
}

/** The instant as a datetime-local value in a zone. */
export function isoToZonedInput(iso: string, tz: string) {
  const p = partsIn(new Date(iso), tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** Wall-clock parts of an instant in a zone (for calendars). */
export const zoned = (iso: string | Date, tz: string) => partsIn(typeof iso === 'string' ? new Date(iso) : iso, tz);

/** YYYY-MM-DD of the instant in a zone. */
export function dayIn(iso: string | Date, tz: string) {
  const p = zoned(iso, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function fmtIn(iso: string | Date, tz: string, style: 'time' | 'day' | 'full' = 'full') {
  const opts: Intl.DateTimeFormatOptions =
    style === 'time' ? { hour: 'numeric', minute: '2-digit' }
      : style === 'day' ? { weekday: 'short', day: 'numeric', month: 'short' }
        : { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** "3:00 PM Eastern · 12:00 AM PKT (next day)" */
export function bothTimes(iso: string, tz: string | null | undefined) {
  const pk = fmtIn(iso, PKT, 'full');
  if (!tz || tz === PKT) return `${pk} PKT`;
  const shift = dayIn(iso, PKT) !== dayIn(iso, tz) ? (dayIn(iso, PKT) > dayIn(iso, tz) ? ' (next day)' : ' (day before)') : '';
  return `${fmtIn(iso, tz, 'full')} ${zoneMeta(tz).label} · ${fmtIn(iso, PKT, 'time')} PKT${shift}`;
}
