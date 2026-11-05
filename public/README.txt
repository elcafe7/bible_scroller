Bible scroller 0.1.0 (Geneva Bible 1599, optional Matthew Henry)

Open it
  1. Double-click index.html. Safari and some browsers will run it directly.
  2. If you see "Bible data missing or unreadable", your browser blocks local
     data files. Serve this folder instead (still fully offline):
        python3 -m http.server 8000      then open http://localhost:8000/
     or npx serve .                       then open the printed address

Use it
  Pick a book and passage, choose a speed, press Start. The controls fade
  after a few seconds; tap, click, or press any key to bring them back.
  Space pauses and resumes. "Matthew Henry between verses" adds his note
  after the verses it covers. Settings are remembered in this browser only.

No network access, accounts, or server code. Bible text and commentary are
public domain.
