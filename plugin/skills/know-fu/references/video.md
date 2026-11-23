# Reading a recording that has a screen

Contents: what you have · what must be true at the end · the order · choosing where to look · reading a frame · speech, screen and inference · the Frames line · exhibits · long recordings.

This guide is for a video where the picture carries content: a chart, a slide, a tool's window. It adds to the ingest guide, which still governs the map, the plan, the principles, the notes and the checks. A talking head needs none of this; say so on its Frames lines and read it as audio.

## What you have

- **The transcript.** One sentence per line, each starting with the time its first word was spoken.
- **Filmstrips.** When the video was added, code found each moment the screen changed and then held still, and laid those moments out as sheets of small thumbnails with their times. `kf_read` with `view: "filmstrip"` lists the sheets; add `loc: "1"` for a sheet.
- **Any frame you ask for**, at a size you can read: `view: "image"` with a time. Add `box: "x,y,w,h"` (percent: left, top, width, height) for a region cut from the original frame and enlarged.
- **The screen for a sentence:** `view: "screen"` with the sentence's time. It returns the settled picture as the sentence ends, and the picture before it began when the two differ. Use it when the words point at the screen, because a frame taken at the second a speaker says "this one here" usually catches the pen mid-stroke.

From a shell the same calls are `cli.ts read KEY --view filmstrip`, `read KEY 1 --view filmstrip`, `read KEY 12:36 --view image --box "30,10,40,40"`, `read KEY 12:31 --view screen` and `source keep KEY 12:36`. Each prints the path of an image to open.

The filmstrip is a map made by arithmetic on pixels. It knows nothing about what matters. In a test on three lessons it held 93% of the chart states worth seeing, about a third of its frames were near-repeats of a neighbour, and a pop-up window over the chart counts as a change. It tells you what was on screen and when. You decide where to look, and you can ask for any second, on the filmstrip or not.

## What must be true at the end

1. Wherever the teaching depended on the picture, what it showed is on record in specifics: in an exhibit record, and in the principle or note that uses it.
2. Every map entry has a Frames line listing the frames you opened, or saying why none.
3. Each frame a claim rests on is kept as an exhibit, with a record a reader can use without opening it.
4. What the speaker said, what the screen showed and what you inferred are told apart.

## The order

The order matters here, because each step tells you what the next should spend on.

1. **Read the whole transcript and look at every filmstrip sheet** before you open a single frame at reading size. A sheet costs about what two full frames cost, so seeing all of them is cheap, and it shows you which charts appear, when the speaker returns to one, and where the picture changes while the words say little. You can't ask for what you don't know is there.
2. **Choose where to look**, stretch by stretch (next section).
3. **Open the frames in batches**, several calls in one step, in time order, with the transcript for that stretch beside them. Loading frames one at a time costs far more, because each step re-reads everything you have loaded.
4. **Write each stretch's map entry as you finish it**: its heading, a line saying what the stretch covers and what the picture carried, and its Frames line. Keep what you read off the frames in a reading-notes file as you go, so an interruption loses one stretch. These entries are the Map the ingest guide asks for at its second stage; the plan, the principles and the notes come after it, as that guide says.

One reader takes a whole recording, because a lesson sets up at minute five what it pays off at minute forty.

## Choosing where to look

Three reasons to open a frame at reading size:

- **The words lean on the picture.** "This low here", "see how it reacts", a level pointed at and never named, a comparison between two things on screen, a number read off the chart. The test: can you restate the point with its specifics, without the picture? If you can't, look. Sentences that sound complete often aren't: "price takes the liquidity and reverses" doesn't say which low, on which timeframe, at what price.
- **The filmstrip shows something the words skipped.** A drawing finished while the speaker said filler, an arrow never mentioned, the chart as it stood just before the speaker left it. The last frame before a change of chart is usually the one with every mark on it. A menu, a legend or a tool panel that opens for a few seconds is worth a look too: it often lists the author's own names for things, which the speech uses and never spells out.
- **The transcript is in doubt.** A term that reads wrong, a number, a "not" that changes the rule. A label on screen can settle what the audio can't.

Don't open every filmstrip frame. Near-repeats teach nothing, and a pile of similar pictures makes each one harder to read well.

One thing no frame can show: where a speaker points with the cursor when nothing is drawn. "This low here" with a moving pointer leaves no mark. Open the frames either side, read what the next sentences say about it, and if it is still unclear, write that the words point at something the picture doesn't settle.

## Reading a frame

Write down what the picture shows as data, not as an impression. For a chart: the instrument, the timeframe, the date range, each mark with where it sits (date and price, or the label beside it), and what was drawn in what order when the order is the point. For a tool's window: the control, its setting and its unit. An edited video often crops the chart so its header and axes are gone. Then say what isn't visible, and when you take the instrument or the date from somewhere else (another frame, a post shown on screen), say where.

Say how each number was read: **printed** when it is text on the screen (an axis tag, a label, a readout), **off the axis** when you judged a position between gridlines, with the tolerance, and **from data** when you checked it against an outside record. Where exact values matter and an outside record exists, such as exchange prices, check against it with whatever market-data tool your session has and say that you did; with no such tool, say the value was not checked. Say which values you checked, one by one. A line like "data confirm every price" covers the ones you didn't check as well, and a reader will trust all of them. For a worked example with a real date, this check is worth making even when nothing looks wrong: it turns the example into a case someone can test against, and it settles what a speaker misremembers, such as which day it was. A model reading a chart leans on what it remembers of that market; when a number comes from memory and not from the frame, say that too. When a chart is being replayed bar by bar, the readout for the last bar is of a bar still forming, so its high, low and close are not that bar's final values.

When a detail is in doubt, crop it with `box`. Choose the box from the frame at reading size, not from a filmstrip thumbnail, where a guess easily lands on the wrong region. Small text, a price digit, whether a candle's wick or its body crossed a line, a thin or faint line: these are read from the crop, never guessed from the full frame. A webcam box, subtitles or a pop-up can cover part of the picture, so a mark missing under one is not a mark that isn't there.

A mark on one chart is a case. It becomes a rule only when the speaker states it as one, or when several cases agree, and what you write says which. A principle shown only on charts the speaker chose has `worked cases` as its support, however sure the speaker sounds.

## Speech, screen and inference

Keep them apart in everything you write: what the speaker **said** (cite the sentence's time, `[KEY 12:31]`), what the screen **showed** (cite the frame's time with the word screen, `[KEY 12:36 screen]`), and what you **inferred** from the two. Words printed on the screen, such as a legend, a note on the chart or a label, can be quoted in double quotes before a screen citation. The checker can't read pixels, so it checks that a frame at that time was opened, and for a citation in a principle, a note or a topic page it asks that the frame be kept. A projection drawn past the last candle is a forecast, not a result. When the audio and the picture disagree, give both and say which you could verify.

## The Frames line

End each map entry with one:

```
- **Frames:** 12:36, 13:02, 14:10 (crop of the price axis)
- **Frames:** none: the speaker is on camera for this whole stretch
```

List each frame by the time the tool gave it, which for `view: "screen"` is the time of the frame and not of the sentence. A note in brackets after a time is fine. `kf_check` compares the line with what happened. It warns when the screen changed three or more times in a stretch whose map entry has no Frames line, and when the line names a frame that was never made. It can tell that a frame was made, not that it was looked at: `view: "screen"` often makes two, so list only the ones you read. The line is how the owner can tell a stretch that was looked at from one that was written from the words alone.

## Exhibits

When a claim in a principle or a note rests on what a frame shows, keep the frame: `kf_source` with `action: "keep"`, the source key and the time. With `box` it keeps that crop and the frame it was cut from. A kept frame stays in the source's `exhibits` folder. Every other frame is a cache that can be cleared, and a video file over 300 MB is left where it was and not copied into the library, so a kept frame is the only picture sure to be there later.

Then write its record on the source page, under `## Exhibits`:

```
### 12:36 EURUSD 4h, the sweep under the range low

- **Shows:** the range from 3 to 14 October with its low marked, one wick through it on 13 October, and the close back inside.
- **Marks:** range low 0.9632 (printed); sweep low about 0.9605 (off the axis, within 5 pips); label "SSL" under the low.
- **Said:** "that's the liquidity I want to see taken before I'm interested" [12:31].
- **Supports:** [[sweep-before-entry]]
```

(The example is invented to show the shape.) Write the record so a reader who never opens the image still has its content. One record covers a moment: the frame and any crops kept from it, so name each crop's region in the record.

Say each thing once. Text read off the screen word for word, such as a table or the notes on a chart, lives in the exhibit record. The principle or note states the idea, gives the few values it needs, and cites the moment. Copying a table into the record and a note makes two copies that drift apart when one is edited. Cite the moment as `[KEY 12:36 screen]`; `kf_read` with `view: "image"` at that time returns the kept frame. Keep the frames that carry a claim, not every frame you opened. There is no budget for exhibits: when a claim rests on the picture, cite the screen and keep that frame, and don't cite the speech in its place to save one.

## Long recordings

Past about forty minutes, or about two hundred filmstrip frames, one context holds the frames poorly. Split the recording by its own chapters across readers, as the ingest guide describes for a long book. Give each reader the whole transcript and its own span of frames, and keep the plan, the principles and the topic page for yourself.
