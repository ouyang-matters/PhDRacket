import { describe, expect, it } from "vitest";
import { displayAddress, fileNameOf, isLocalFileAddress, isLocalFileInput, opensInBrowserTab, toWebAddress } from "./address";

describe("toWebAddress", () => {
  it("adds https to bare addresses", () => {
    expect(toWebAddress("student.cs.uwaterloo.ca/~cs145")).toBe("https://student.cs.uwaterloo.ca/~cs145");
    expect(toWebAddress("docs.racket-lang.org")).toBe("https://docs.racket-lang.org/");
    expect(toWebAddress("https://learn.uwaterloo.ca/d2l/home")).toBe("https://learn.uwaterloo.ca/d2l/home");
  });

  it("uses http for this computer", () => {
    expect(toWebAddress("localhost:8000/a.html")).toBe("http://localhost:8000/a.html");
    expect(toWebAddress("127.0.0.1:3000")).toBe("http://127.0.0.1:3000/");
  });

  it("refuses what is not a web page", () => {
    for (const bad of ["", "racket lists", "file:///C:/a.rkt", "javascript:alert(1)", "mailto:a@b.c", "hello"]) {
      expect(toWebAddress(bad), bad).toBe(null);
    }
  });
});

describe("local files in browser tabs", () => {
  it("recognizes file paths and file addresses", () => {
    for (const p of ["C:\\Exams\\q1.pdf", "c:/exams/q1.pdf", "/Users/me/q1.pdf", "\\\\server\\share\\a.html", "file:///C:/a.pdf", " /home/me/a b.pdf "]) {
      expect(isLocalFileInput(p), p).toBe(true);
    }
    for (const p of ["student.cs.uwaterloo.ca/~cs145", "https://a.b/c.pdf", "localhost:8000", "//cdn.example/x", "q1.pdf"]) {
      expect(isLocalFileInput(p), p).toBe(false);
    }
  });

  it("shows a local file's path in the address bar", () => {
    expect(displayAddress("http://phdfile.localhost/C:/Exams/Q%201.pdf")).toBe("C:\\Exams\\Q 1.pdf");
    expect(displayAddress("phdfile://localhost/Users/me/exam%20(a).pdf")).toBe("/Users/me/exam (a).pdf");
    expect(displayAddress("https://example.com/a.pdf")).toBe("https://example.com/a.pdf");
    expect(isLocalFileAddress("phdfile://localhost/a.pdf")).toBe(true);
    expect(isLocalFileAddress("https://phdfile.localhost.evil.com/a")).toBe(false);
  });

  it("opens PDFs and images in browser tabs, source files in the editor", () => {
    expect(opensInBrowserTab("/x/Exam.PDF")).toBe(true);
    expect(opensInBrowserTab("C:\\x\\diagram.png")).toBe(true);
    expect(opensInBrowserTab("/x/a.rkt")).toBe(false);
    expect(opensInBrowserTab("/x/notes.html")).toBe(false);
    expect(fileNameOf("C:\\Exams\\q1.pdf")).toBe("q1.pdf");
  });
});
