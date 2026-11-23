# Reading a recording that has a screen

Contents: what you have · what must be true at the end · the order · choosing where to look · reading a frame · speech, screen and inference · the Frames line · exhibits · long recordings.

This guide is for a video where the picture carries content: a chart, a slide, a tool's window. It adds to the ingest guide, which still governs the map, the plan, the accounts and the checks. A talking head needs none of this; say so on its Frames lines and read it as audio.

## What you have

- **The transcript.** One sentence per line, each starting with the time its first word was spoken.
- **Filmstrips.** When the video was added, code found each moment the screen changed and then held still, and laid those moments out as sheets of small thumbnails with their times. `kf_read` with `view: "filmstrip"` lists the sheets; add `loc: "1"` for a sheet.
- **Any frame you ask for**, at a size you can read: `view: "image"` with a time. Add `box: "x,y,w,h"` (percent: left, top, width, height) for a region cut from the original frame and enlarged.
- **The screen for a sentence:** `view: "screen"` with the sentence's time. It returns the settled picture as the sentence ends, and the picture before it began when the two differ. Use it when the words point at the screen, because a frame taken at the second a speaker says "this one here" usually catches the pen mid-stroke.

The filmstrip is a map made by arithmetic on pixels. It knows nothing about what matters. In a test on three lessons it held 93% of the chart states worth seeing, about a third of its frames were near-repeats of a neighbour, and a pop-up window over the chart counts as a change. It tells you what was on screen and when. You decide where to look, and you can ask for any second, on the filmstrip or not.

## What must be true at the end

1. Wherever the teaching depended on the picture, the digest for that stretch says what the picture showed, in specifics.
2. Every digest has a Frames line listing the frames you opened, or saying why none.
3. Each frame an account's claim rests on is kept as an exhibit, with a record a reader can use without opening it.
4. What the speaker said, what the screen showed and what you inferred are told apart.

## The order

The order matters here, because each step tells you what the next should spend on.

1. **Read the whole transcript and look at every filmstrip sheet** before you open a single frame at reading size. A sheet costs about what two full frames cost, so seeing all of them is cheap, and it shows you which charts appear, when the speaker returns to one, and where the picture changes while the words say little. You can't ask for what you don't know is there.
2. **Choose where to look**, stretch by stretch (next section).
3. **Open the frames in batches**, several calls in one step, in time order, with the transcript for that stretch beside them. Loading frames one at a time costs far more, because each step re-reads everything you have loaded.
4. **Write each stretch's digest as you finish it**, with its Frames line, so an interruption loses one stretch.

One reader takes a whole recording, because a lesson sets up at minute five what it pays off at minute forty.

## Choosing where to look

Three reasons to open a frame at reading size:

- **The words lean on the picture.** "This low here", "see how it reacts", a level pointed at and never named, a comparison between two things on screen, a number read off the chart. The test: can you restate the point with its specifics, without the picture? If you can't, look. Sentences that sound complete often aren't: "price takes the liquidity and reverses" doesn't say which low, on which timeframe, at what price.
- **The filmstrip shows something the words skipped.** A drawing finished while the speaker said filler, an arrow never mentioned, the chart as it stood just before the speaker left it. The last frame before a change of chart is usually the one with every mark on it.
- **The transcript is in doubt.** A term that reads wrong, a number, a "not" that changes the rule. A label on screen can settle what the audio can't.

Don't open every filmstrip frame. Near-repeats teach nothing, and a pile of similar pictures makes each one harder to read well.

## Reading a frame

Write down what the picture shows as data, not as an impression. For a chart: the instrument, the timeframe, the date range, each mark with where it sits (date and price, or the label beside it), and what was drawn in what order when the order is the point. For a tool's window: the control, its setting and its unit.

Say how each number was read: **printed** when it is text on the screen (an axis tag, a label, a readout), **off the axis** when you judged a position between gridlines, with the tolerance, and **from data** when you checked it against an outside record. Where exact values matter and an outside record exists, such as exchange prices, check against it and say that you did. A model reading a chart leans on what it remembers of that market; when a number comes from memory and not from the frame, say that too.

When a detail is in doubt, crop it with `box`. Small text, a price digit, whether a candle's wick or its body crossed a line, a thin or faint line: these are read from the crop, never guessed from the full frame. A webcam box, subtitles or a pop-up can cover part of the picture, so a mark missing under one is not a mark that isn't there.

A mark on one chart is a case. It becomes a rule only when the speaker states it as one, or when several cases agree, and the account says which.

## Speech, screen and inference

Keep them apart in the digest and the accounts: what the speaker **said** (cite the sentence's time), what the screen **showed** (cite the frame's time), and what you **inferred** from the two. A projection drawn past the last candle is a forecast, not a result. When the audio and the picture disagree, give both and say which you could verify.

## The Frames line

End each digest with one:

```
- **Frames:** 12:36, 13:02, 14:10 (crop of the price axis)
- **Frames:** none: the speaker is on camera for this whole stretch
```

`kf_check` compares the line with what happened. It warns when the screen changed three or more times in a stretch whose digest has no Frames line, and when the line names a frame nobody opened. The line is how the owner can tell a stretch that was looked at from one that was written from the words alone.

## Exhibits

When a claim in an account rests on what a frame shows, keep the frame: `kf_source` with `action: "keep"`, the source key and the time (and `box` to keep a crop too). A kept frame stays in the source's `exhibits` folder. Every other frame is a cache that can be cleared, and a large video is never copied into the library, so a kept frame is the only picture sure to be there later.

Then write its record on the source page, under `## Exhibits`:

```
### 12:36 EURUSD 4h, the sweep under the range low

- **Shows:** the range from 3 to 14 October with its low marked, one wick through it on 13 October, and the close back inside.
- **Marks:** range low 0.9632 (printed); sweep low about 0.9605 (off the axis, within 5 pips); label "SSL" under the low.
- **Said:** "that's the liquidity I want to see taken before I'm interested" [12:31].
- **Supports:** [[sweep-before-entry]]
```

(The example is invented to show the shape.) Write the record so a reader who never opens the image still has its content. In accounts, cite the moment as `[KEY 12:36]`; `kf_read` with `view: "image"` at that time returns the kept frame. Keep the few frames that carry a claim, not every frame you opened.

## Long recordings

Past about forty minutes, or about two hundred filmstrip frames, one context holds the frames poorly. Split the recording by its own chapters across readers, as the ingest guide describes for a long book. Give each reader the whole transcript and its own span of frames, and keep the plan and the topic page for yourself.
