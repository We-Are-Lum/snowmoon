"""
One-off edit of the six DRAFT Learn more texts (owner's rule, 2026-11-12): outside "later", cite chapters 1-14 only.
Material from chapter 15 on moves into "later"; the open sections are rewritten from chapters 1-14, saying less where
the book's first fourteen chapters say little. Zei's text (the owner's) is not touched.

  python3 -I scripts/learn-more/spoiler-fix-2026-11-12.py <drafts dir>
"""
import json
import os
import sys

D = sys.argv[1]
T = lambda s: {'text': s}  # noqa: E731
C = lambda s: {'cite': s}  # noqa: E731
G = lambda term, gid: {'term': term, 'glossaryId': gid}  # noqa: E731


def load(slug):
    return json.load(open(os.path.join(D, f'{slug}.json')))


def save(d):
    json.dump(d, open(os.path.join(D, f'{d["slug"]}.json'), 'w'), indent=1, ensure_ascii=False)


# Gladias: drives from chapter 1; his sleepless nights and wish for Veridia's defense move into "later".
d = load('gladias')
d['drives'] = [T('Doing his job honestly, even when it costs him: at the concert he feels "a burst of courage" and takes the risk to his score '), C('c1-b71'),
               T('. And his family at home, the four children he and Seila raise with their co-family '), C('c1-b125'), T('.')]
later = d['later']
i = next(k for k, s in enumerate(later) if s.get('cite') == 'c23-b91')
later[i + 1:i + 1] = [T('. He can\'t sleep knowing "three of the four children he loved dearly" are in Arctic hands '), C('c24-b2–b6'),
                      T(', and he wants Veridia to defend itself '), C('c21-b96')]
d['invent'] = [
    [T('His age, and how he came to join the Order.')],
    [T('How he and Seila met, and their life before the story starts.')],
    [T('What his days in the Order are like beyond the votes the book shows.')],
    [T('What he is like as a father day to day.')],
    [T('His looks: every look on this site is this edition\'s invention.')],
]
save(d)

# Bai: drives keeps chapter 9; the Thaldur wish stays only in "later".
d = load('bai')
d['drives'] = [T('Success, because growing up alone it was all she had: "All I have is my achievements and my success." '), C('c9-b19'),
               T('. And curiosity about how other people think: "I do want to understand you guys better." '), C('c9-b22')]
d['invent'][3] = [T('What she and Zei become to each other in the end.')]
save(d)

# Seila: who drops the later lies-spotting; drives from chapter 5; the promise and "worth fighting for" move into "later".
d = load('seila')
who = d['who']
j = next(k for k, s in enumerate(who) if 'text' in s and s['text'].startswith('. She is gentle with the kids'))
d['who'] = who[:j] + [T('. She is gentle with the kids '), C('c1-b120'), T('.')]
d['drives'] = [T('Her family, and the people around her. When Gladias wonders about becoming a '), G('Keeper', 'keepers'),
               T(', she wants it to do good for Dzego: "Figure out how to make or adjust the rubrics to support Dzego better." '), C('c5-b113')]
later = d['later']
i = next(k for k, s in enumerate(later) if s.get('cite') == 'c20-b10')
later[i + 1:i + 1] = [T(', and she promises them she will do everything she can to bring them home '), C('c20-b11')]
i = next(k for k, s in enumerate(later) if s.get('cite') == 'c27-b15')
later[i + 1:i + 1] = [T('. The world she loves is "already enough to be worth fighting for." '), C('c27-b95')]
save(d)

# Deluin: start ends at chapter 14; the invasion, his message and the cancelled finals open "later"; drives from chapter 14.
d = load('deluin')
start = d['start']
j = next(k for k, s in enumerate(start) if 'text' in s and 'Then the' in s['text'])
d['start'] = start[:j] + [T('.')]
d['later'] = [T('Then the '), G('Arctic Empire', 'arctic-empire'), T(' invades and annexes Redshire '), C('c15-b6'),
              T('. He writes to Zei: "Don\'t worry, I am alive. Though it looks like I\'m not going to be getting back to Dzego anytime soon." '), C('c15-b53'),
              T('. The finals are cancelled '), C('c15-b82'), T('. ')] + d['later']
later = d['later']
i = next(k for k, s in enumerate(later) if s.get('cite') == 'c19-b153')
later[i + 1:i + 1] = [T(', though "I do not share their sympathies." '), C('c19-b153')]
d['drives'] = [T('His friends and his home. He invites Zei to Redshire and shows him its castles, pine forests and red mountains '), C('c14-b120'), C('c14-b124'),
               T(', and he believes even beautiful nature takes human work to maintain '), C('c14-b127'), T('.')]
d['invent'] = [
    [T('His life in Redshire before the tournament, and how he started playing.')],
    [T('His parents, and what they do.')],
    [T('Who he is closest to at home.')],
    [T('His looks: every look on this site is this edition\'s invention.')],
]
save(d)

# Mu: who drops the Kungaupei; drives drops the battle morning; both open her "later".
d = load('mu')
who = d['who']
j = next(k for k, s in enumerate(who) if 'text' in s and 'She is also one of the few' in s['text'])
d['who'] = who[:j] + [T('.')]
d['drives'] = [T('The future, and the young defenders the game exists to raise '), C('c10-b195'), T('. Before a match she raises a glass: "To our future," '), C('c7-b49')]
d['later'] = [T('She is one of the few who know about the '), G('Kungaupei', 'kungaupei'), T(', a '), G('Dzegojan', 'dzegojan'), T(' group '), C('c15-b79'), C('c27-b54'), T('. ')] + d['later']
d['later'] += [T('. On the morning of the battle, asked if they are ready, she says no: "But nothing meaningful ever happens when people are ready." '), C('c29-b4'), C('c29-b5')]
d['invent'] = [
    [T('Her own past: whether she ever played Minpentai, and how she came to work with the priests.')],
    [T('How she and Zei first met, and what she does away from the matches.')],
    [T('What she has given up for the work she keeps quiet about.')],
    [T('Her looks: every look on this site is this edition\'s invention.')],
]
save(d)

# Ephelion: drives from his own words in chapters 3 and 13; Seila's reading moves into "later".
d = load('ephelion')
d['drives'] = [T('In his own words: strength, winning and growth. "Build the future." '), C('c3-b5'), T(' "Grow stronger." '), C('c13-b64')]
later = d['later']
i = next(k for k, s in enumerate(later) if s.get('cite') == 'c21-b75')
later[i + 1:i + 1] = [T(' In her reading, his goal is "to inspire people inside Veridia to join the Arctic cause." '), C('c21-b76')]
save(d)
print('edited six drafts')

