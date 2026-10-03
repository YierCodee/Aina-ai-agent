import os
import re
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

load_dotenv()

# Tipe aktivitas Moodle yang di-scrape (ditentukan dari href /mod/<tipe>/)
MOD_TYPES = ("assign", "quiz")

class BebasUmpoPlaywright:
    def __init__(self, base_url: str | None = None,
                 username: str | None = None,
                 password: str | None = None):
        # Prioritas: argumen eksplisit > settings terpusat > os.getenv.
        # settings dibaca lazy agar import modul ini tidak crash saat
        # config belum siap (pola sama seperti models/gemini.py).
        _s_base = _s_user = _s_pass = None
        try:
            from backend.core.config import settings as _settings

            _s_base = (_settings.lms_base_url or "").strip() or None
            _s_user = (_settings.lms_username or "").strip() or None
            _s_pass = (_settings.lms_password or "").strip() or None
        except Exception:  # noqa: BLE001 - fallback ke env langsung
            pass
        self.base_url = (
            base_url
            or _s_base
            or os.getenv("LMS_BASE_URL", "https://bebas.umpo.ac.id")
        )
        self.username = username or _s_user or os.getenv("LMS_USERNAME")
        self.password = password or _s_pass or os.getenv("LMS_PASSWORD")

    # ------------------------------------------------------------------
    # Session & navigasi (login sekali, dipakai untuk banyak halaman)
    # ------------------------------------------------------------------
    @asynccontextmanager
    async def _session(self):
        if not self.username or not self.password:
            raise ValueError(
                "LMS_USERNAME dan LMS_PASSWORD belum diatur di file .env"
            )

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            try:
                context = await browser.new_context()
                page = await context.new_page()
                yield page
            finally:
                await browser.close()

    async def _goto(self, page, url: str, wait_selector: str | None = None,
                    wait_timeout: int = 30000):
        """Buka URL, auto-login SSO bila kena redirect, lalu tunggu konten."""
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)

        # Handling Auto-login SSO jika belum terautentikasi
        if "login" in page.url or "apps.umpo.ac.id" in page.url:
            await self._login(page)
            # Pastikan kembali ke halaman tujuan setelah login
            if url not in page.url:
                await page.goto(url, wait_until="domcontentloaded", timeout=60000)

        if wait_selector:
            await page.wait_for_selector(wait_selector, timeout=wait_timeout)

    async def _login(self, page):
        print("[Browser] Melakukan login SSO...")
        user_input = "input#identity, input[name='email'], input[name='username'], input#username"
        pass_input = "input[type='password'], input[name='password'], input#password, input#password-input"

        await page.wait_for_selector(user_input, state="visible", timeout=15000)
        await page.fill(user_input, self.username)
        await page.fill(pass_input, self.password)
        await page.click("button[type='submit'], input[type='submit'], #loginbtn")

        # Tunggu sampai tidak lagi berada di portal SSO apps.umpo.ac.id.
        # (URL callback Moodle juga mengandung kata "login", jadi jangan cek kata "login")
        try:
            await page.wait_for_url(
                lambda u: "apps.umpo.ac.id" not in u,
                timeout=30000,
            )
        except Exception:
            pass

        if "apps.umpo.ac.id" in page.url:
            try:
                body = (await page.inner_text("body"))[:300]
            except Exception:
                body = ""
            raise RuntimeError(
                "Login SSO gagal: periksa LMS_USERNAME / LMS_PASSWORD di .env "
                "atau akun butuh MFA. Halaman saat ini: "
                f"{body}"
            )

        print("[Browser] Login berhasil")

    # ------------------------------------------------------------------
    # Scraping daftar course
    # ------------------------------------------------------------------
    async def _list_courses(self, page) -> list[dict]:
        """Ambil daftar course dari dashboard /my/courses.php."""
        url = f"{self.base_url}/my/courses.php"
        await self._goto(page, url)

        # Link course dimuat via AJAX, jadi tunggu dulu
        try:
            await page.wait_for_selector(
                'a[href*="course/view.php"]', timeout=20000
            )
        except Exception as e:
            raise RuntimeError(
                f"Daftar course tidak termuat (url={page.url}, "
                f"title={await page.title()})."
            ) from e

        raw = await page.eval_on_selector_all(
            'a[href*="course/view.php"]',
            """els => els.map(e => ({
                 href: e.getAttribute('href'),
                 text: (e.innerText || '').trim()
               }))""",
        )

        courses, seen = [], set()
        for item in raw:
            href = item.get("href") or ""
            m = re.search(r"course/view\.php\?id=(\d+)", href)
            if not m:
                continue
            course_id = int(m.group(1))
            if course_id in seen:
                continue
            seen.add(course_id)
            courses.append(
                {
                    "course_id": course_id,
                    "name": item.get("text") or f"Course {course_id}",
                    "url": f"{self.base_url}/course/view.php?id={course_id}",
                }
            )
        return courses

    # ------------------------------------------------------------------
    # Scraping aktivitas course (tugas & quiz)
    # ------------------------------------------------------------------
    async def _get_activities(self, page, course_id: int,
                              mod_types: tuple[str, ...] = MOD_TYPES) -> list[dict]:
        """Ambil aktivitas course berdasarkan ciri href /mod/<tipe>/view.php."""
        url = f"{self.base_url}/course/view.php?id={course_id}"
        await self._goto(
            page, url, wait_selector=".activity-item, li.section", wait_timeout=30000
        )

        raw = await page.eval_on_selector_all(
            'a[href*="/mod/"]',
            """els => els.map(a => {
                 const href = a.getAttribute('href') || '';
                 const m = href.match(/\\/mod\\/([a-z_]+)\\/view\\.php/);
                 if (!m) return null;
                 const item = a.closest('.activity-item') || a.parentElement;
                 const nameEl = a.querySelector('.instancename');
                 const hidden = nameEl ? nameEl.querySelector('.accesshide') : null;
                 let title = nameEl
                    ? nameEl.innerText.trim()
                    : (a.innerText || '').trim();
                 if (hidden) {
                    title = title.replace(hidden.innerText.trim(), '').trim();
                 }
                 const sectionEl = a.closest('li.section, [id^="section-"]');
                 let section = '';
                 if (sectionEl) {
                    const h = sectionEl.querySelector('.sectionname, h3, h4, h5');
                    if (h) section = h.innerText.trim();
                 }
                 const fromData = item && item.dataset ? item.dataset.id : null;
                 const fromUrl = new URL(a.href, location.origin)
                    .searchParams.get('id');
                 return {
                    type: m[1],
                    cmid: fromData || fromUrl,
                    title: title || m[1],
                    url: a.href,
                    section: section
                 };
               }).filter(Boolean)""",
        )

        activities, seen = [], set()
        for item in raw:
            if item.get("type") not in mod_types:
                continue
            try:
                cmid = int(item["cmid"])
            except (KeyError, TypeError, ValueError):
                continue
            key = (item["type"], cmid)
            if key in seen:
                continue
            seen.add(key)
            activities.append(
                {
                    "type": item["type"],
                    "cmid": cmid,
                    "title": item.get("title") or "Tanpa Judul",
                    "section": item.get("section") or "",
                    "url": item.get("url")
                    or f"{self.base_url}/mod/{item['type']}/view.php?id={cmid}",
                }
            )
        return activities

    # ------------------------------------------------------------------
    # API publik
    # ------------------------------------------------------------------
    async def list_my_courses(self) -> list[dict]:
        async with self._session() as page:
            return await self._list_courses(page)

    async def get_activities(self, course_id: int) -> list[dict]:
        async with self._session() as page:
            return await self._get_activities(page, course_id)

    async def scrape_all_activities(self) -> list[dict]:
        """Semua course yang diikuti -> daftar tugas & quiz tiap course (1 login)."""
        results = []
        async with self._session() as page:
            courses = await self._list_courses(page)
            print(f"[Browser] Ditemukan {len(courses)} course")

            for i, course in enumerate(courses, 1):
                entry = {**course, "activities": [], "error": None}
                print(
                    f"[{i}/{len(courses)}] {course['name']} "
                    f"(id={course['course_id']}) ..."
                )
                try:
                    entry["activities"] = await self._get_activities(
                        page, course["course_id"]
                    )
                except Exception as e:
                    entry["error"] = str(e)
                    print(f"    ! Gagal: {e}")
                results.append(entry)
        return results

    # ------------------------------------------------------------------
    # Detail satu tugas (status pengumpulan)
    # ------------------------------------------------------------------
    async def get_assignment_detail(self, assign_cmid: int):
        """
        Mengambil detail & status pengumpulan tugas berdasarkan Course Module ID (cmid)
        Contoh: assign_cmid = 38435
        """
        assign_url = f"{self.base_url}/mod/assign/view.php?id={assign_cmid}"
        print(f"[Browser] Membuka Halaman Tugas: {assign_url}")

        async with self._session() as page:
            await self._goto(page, assign_url)
            # Tunggu tabel status tugas benar-benar termuat
            try:
                await page.wait_for_selector(
                    ".submissionsummarytable, #submissionstatustable, table.generaltable",
                    timeout=30000,
                )
            except Exception as e:
                raise RuntimeError(
                    f"Halaman tugas tidak termuat (url={page.url}, "
                    f"title={await page.title()}). "
                    "Kemungkinan login gagal, butuh MFA, atau cmid tidak valid."
                ) from e

            print(f"[Browser] Berhasil masuk ke Halaman Tugas cmid={assign_cmid}")
            html_content = await page.content()

        result = self.parse_assignment_page(html_content)
        result["cmid"] = assign_cmid
        result["url"] = assign_url
        return result

    @staticmethod
    def parse_assignment_page(html_content: str):
        soup = BeautifulSoup(html_content, "html.parser")

        # 1. Ambil Judul Tugas
        title_elem = soup.select_one(
            ".page-header-headings h1, h1.page-header"
        ) or soup.select_one("h2")
        title = title_elem.get_text(strip=True) if title_elem else "Tanpa Judul"

        # 2. Ambil Deskripsi/Instruksi Tugas
        intro_elem = soup.select_one("#intro, .activity-description")
        instructions = intro_elem.get_text(strip=True) if intro_elem else ""

        # 3. Parse Tabel "Submission status"
        #    Prioritaskan tabel submission status, bukan "Grading summary"
        status_data = {}
        table = (
            soup.select_one(".submissionsummarytable, #submissionstatustable")
            or soup.select_one("table.generaltable")
        )

        if table:
            for row in table.find_all("tr"):
                th = row.find("th")
                td = row.find("td")
                if th and td:
                    key = th.get_text(strip=True)

                    # Ekstraksi khusus untuk daftar file yang diunggah
                    if "file submission" in key.lower():
                        files = []
                        for a_tag in td.find_all("a"):
                            filename = a_tag.get_text(strip=True)
                            file_url = a_tag.get("href", "")
                            if filename and file_url:
                                files.append({"name": filename, "url": file_url})
                        status_data[key] = files
                    else:
                        status_data[key] = td.get_text(strip=True)

        # 4. Cek Tombol yang Tersedia (Add / Edit / Remove submission)
        def _has_button(text: str) -> bool:
            text = text.lower()
            for tag in soup.find_all(["input", "button"]):
                label = (tag.get("value") or tag.get_text() or "").lower()
                if text in label:
                    return True
            return False

        if _has_button("add submission"):
            action_button = "Add submission"
        elif _has_button("edit submission"):
            action_button = "Edit submission"
        else:
            action_button = None

        def _get(key: str, default):
            for k, v in status_data.items():
                if k.lower() == key.lower():
                    return v
            return default

        return {
            "title": title,
            "instructions": instructions,
            "submission_status": _get("Submission status", "Draft / Not submitted"),
            "grading_status": _get("Grading status", "Not graded"),
            "last_modified": _get("Last modified", "-"),
            "submitted_files": _get("File submissions", []),
            "available_action": action_button,
            "status_details": status_data,
        }


# --- Cara Menjalankan: scraping semua course -> daftar tugas & quiz ---
async def main():
    client = BebasUmpoPlaywright()
    results = await client.scrape_all_activities()

    print("\n" + "=" * 60)
    print("DAFTAR TUGAS & QUIZ PER COURSE")
    print("=" * 60)

    def _print_group(label: str, items: list[dict]):
        print(f"    {label}:")
        if not items:
            print("      (tidak ada)")
            return
        for n, act in enumerate(items, 1):
            section = f" | {act['section']}" if act["section"] else ""
            print(f"      {n}. [{act['cmid']}] {act['title']}{section}")
            print(f"         {act['url']}")

    total_assign = total_quiz = 0
    for i, course in enumerate(results, 1):
        print(f"\n[{i}] {course['name']} (course_id={course['course_id']})")
        if course["error"]:
            print(f"    ! Gagal scrape: {course['error']}")
            continue
        acts = course["activities"]
        assigns = [a for a in acts if a["type"] == "assign"]
        quizzes = [a for a in acts if a["type"] == "quiz"]
        total_assign += len(assigns)
        total_quiz += len(quizzes)
        _print_group("Tugas", assigns)
        _print_group("Quiz", quizzes)

    ok = sum(1 for c in results if not c["error"])
    print("\n" + "-" * 60)
    print(
        f"Total: {total_assign} tugas + {total_quiz} quiz "
        f"dari {ok}/{len(results)} course berhasil"
    )


if __name__ == "__main__":
    asyncio.run(main())
