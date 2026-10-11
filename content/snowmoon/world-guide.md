# Snowmoon: a world guide

> AI-made: written by an AI model, Claude (the coding agent, a closed model), from the book and from the spoken summary's chapter notes; each line checked against its cited passages. Not by the author.
>
> A guide to Snowmoon by Vitalik Buterin, made from the book on 2026-10-11. GPL-3.0, like the book.

A guide to Snowmoon's world for planning pieces: characters, places, institutions and technology, Minpentai, factions and a timeline. Every line cites the blocks it rests on and carries from_chapter, the latest chapter it depends on, so it can be filtered to how far someone has read.

Generated from `content/snowmoon/world-guide.json` by `scripts/world-guide.ts render`; edit the JSON, not this file. "ch N" is the latest chapter a line depends on. How it was made: `content/snowmoon/recipes/world-guide.json`.

## Characters

### Gladias

- *who:* A Veridian citizen in Meldan and an Acolyte, an Order of Steering member in training. (ch 1; c1-b1, c1-b57, c1-b19, c1-b56)
- *who:* Thirty-nine; from a fairly middle-class family; took up programming and law in his spare time. (ch 8; c8-b52, c8-b54)
- *wants:* To become a Sentinel; his prediction score is ninety-two, and above ninety he gets in. (ch 1; c1-b65, c1-b68)
- *wants:* Steering to reward openness: writing an alternative client for Silverchat's open interface is what drew him into Steering. (ch 8; c3-b24, c8-b56)
- *fears:* Being exposed: the Order's security rests on its members' privacy, and a bounty rewards anyone who guesses a member's task. (ch 1; c1-b75, c1-b76)
- *changes:* Chooses to apply as a Keeper rather than a Sentinel, after Delwart's push and Seila's encouragement. (ch 6; c3-b112, c5-b113, c5-b116, c6-b158, c3-b110, c5-b102)
- *changes:* Is accepted into the Order by a ten-to-ten committee vote broken by the chairman. (ch 8; c8-b97, c8-b99, c8-b101)
- *changes:* Goes to Dzego to learn how it resists the Arctics, and becomes a de facto adviser to the Kungaupei. (ch 24; c16-b25, c18-b2, c24-b20, c16-b27)
- *changes:* Apologizes to Seila for not trusting her mind as well as her heart. (ch 21; c21-b90, c21-b91)
- *relationships:* Partner of Seila; father of Zven and Lily; "Uncle Glad" to Febric. (ch 1; c1-b101, c1-b125, c1-b130)
- *relationships:* Close friend of Mov, who calls him Glad. (ch 3; c3-b32, c3-b10)

### Seila

- *who:* Gladias's partner, a Veridian blogger who writes about economics and culture. (ch 5; c1-b101, c1-b102, c5-b58, c5-b64, c5-b61)
- *wants:* Gladias to use the Keeper role to make the tax rules help Dzego. (ch 5; c5-b113)
- *changes:* Sees through Delwart's Silverchat story, tracks down other Keepers he approached, and concludes he is not from Silverchat. (ch 20; c20-b36, c20-b42, c20-b179, c20-b63, c20-b177)
- *changes:* Concludes Delwart is an Arctic propagandist working to make the Order ineffective. (ch 21; c21-b71, c21-b75, c21-b77, c21-b49, c21-b57)
- *changes:* Proposes a Silverchat poll to show the courts that changing the army would be democratic. (ch 27; c27-b11, c27-b15, c27-b14)
- *relationships:* Friend of Jahn in Freetown; meets Zei and Bai there by chance. (ch 5; c5-b58, c5-b93, c5-b1, c5-b56, c5-b57)

### Mov

- *who:* Gladias's friend in the Order, who jokes that he is the Arctic Emperor. (ch 3; c3-b10, c3-b11, c3-b32, c3-b12)
- *wants:* To shadow Gladias at his meetings and find out who Delwart really is. (ch 13; c3-b13, c6-b28, c13-b39, c13-b40)
- *changes:* Is selected at random to become a Herald, a retired member with no formal power. (ch 8; c8-b134, c8-b136, c6-b73)
- *relationships:* Follows Delwart for months; later searches for the truth with Seila. (ch 20; c6-b30, c20-b15, c20-b30, c20-b42, c20-b56)

### Delwart

- *who:* A man in a privacy robe who tracks Gladias down and meets him in Greater Plum Harbor. (ch 3; c3-b83, c3-b87, c3-b71, c3-b79, c3-b86)
- *wants:* Says he wants "actual freedom": fewer nudges, and Keepers who delete every rubric. (ch 3; c3-b108, c3-b112)
- *changes:* After Redshire falls, claims he works with others for Silverchat. (ch 16; c16-b13, c15-b6, c16-b10)
- *changes:* Seila finds he told each Keeper something different, and concludes he is an Arctic. (ch 21; c20-b152, c21-b71, c20-b177)

### Zei

- *who:* Zei Leimin, a student in Pafogai Du and a Minpentai player. (ch 4; c2-b2, c4-b90, c2-b1, c2-b11)
- *wants:* To win the Minpentai championship, partly to buy his mother a compute box with the prize money. (ch 7; c4-b15, c4-b73, c7-b138)
- *fears:* That the Arctic threat is real, after his classroom is bombed and his arm broken. (ch 5; c2-b100, c2-b104, c2-b112, c5-b72)
- *changes:* Is recruited by Den into defense and switches his studies to cryptography. (ch 9; c9-b73, c9-b137, c9-b56)
- *changes:* Is named national champion when the final is cancelled, and says he does not want to win like this. (ch 15; c15-b82, c15-b85, c15-b86)
- *changes:* Supervises the drone battle for Northshore. (ch 29; c29-b31, c29-b32, c29-b13)
- *relationships:* Close friend of Fin; rival, then ally and friend, of Bai; friend of Deluin. (ch 29; c2-b2, c4-b72, c29-b10, c14-b99, c2-b113, c14-b19, c14-b96)
- *relationships:* His mother is Min. (ch 5; c5-b4)

### Fin

- *who:* Zei's friend in Pafogai Du, a student training with the Bansunpei. (ch 7; c2-b2, c7-b11, c2-b1)
- *changes:* Explains that Dzegoban is coordination training, and that the Bansunpei used its channels to change Dzego's habits after Redshire. (ch 18; c18-b110, c18-b117, c18-b120)
- *changes:* Helps build the attack on the Arctic drones' AI with Bansunpei researchers. (ch 30; c30-b6, c30-b9, c30-b10, c30-b11)

### Bai

- *who:* Bai Jahen, Zei's Minpentai rival in Pafogai Du. (ch 4; c4-b72, c4-b90, c4-b1, c4-b7)
- *fears:* Losing what she has: her parents died in a lab explosion, and all she had was her success. (ch 9; c9-b13, c9-b14, c9-b19)
- *wants:* Success as proof she is strong; she later says Zei's curiosity was a purer motive. (ch 24; c24-b48, c24-b50, c24-b52)
- *changes:* Learns to cooperate with Zei, then gives him advice and hugs as a friend. (ch 29; c4-b135, c14-b24, c29-b8, c29-b7, c29-b9)
- *changes:* Considers spending a year in Thaldur to understand the Arctics. (ch 32; c32-b98)

### Mu

- *who:* An older woman in Dzego who knows Zei, at the Minpentai games. (ch 4; c4-b62, c4-b67, c4-b1, c4-b63, c4-b65)
- *changes:* Explains that Minpentai is military training; later works with the Kungaupei. (ch 26; c10-b192, c10-b194, c26-b95, c10-b175, c10-b185)
- *changes:* Saves the rescue of Tafindel with a new plan, and takes over Group South when Den is lost. (ch 29; c26-b122, c29-b110, c26-b121, c26-b151, c29-b108)

### Den

- *who:* A High Council member of the Kungaupei. (ch 9; c9-b56)
- *wants:* To recruit Zei into defense; after Redshire, for the shadow society to become the society. (ch 15; c9-b73, c15-b117, c15-b118, c9-b56, c15-b6, c15-b94)
- *changes:* Leads Group South in the battle for Northshore and is almost certainly killed when a rear base is hit. (ch 29; c29-b27, c29-b108, c29-b13, c29-b26)

### Deluin

- *who:* A contestant from Redshire at Dzego's national championship. (ch 12; c12-b71, c12-b75, c12-b80, c12-b84)
- *changes:* Trapped by the invasion; his parents side with the Arctics, and he plays along to win their trust. (ch 19; c15-b53, c19-b153, c15-b12)
- *changes:* Becomes an Arctic commander and helps Veridia break the southern flank. (ch 30; c29-b114, c30-b61)
- *relationships:* Befriends Zei at the nationals and invites him to Redshire. (ch 14; c14-b99, c14-b120, c14-b96, c14-b103)

### Lily

- *who:* Gladias and Seila's daughter, who struggles at school. (ch 1; c1-b119, c1-b125)
- *changes:* Is drawn to Arctic propaganda and runs away to Arctic-held Northglade. (ch 26; c23-b84, c23-b88, c23-b91, c26-b62)
- *changes:* Argues back at her Arctic teacher, is put in detention, and wants to come home. (ch 28; c28-b61, c28-b64, c28-b67, c28-b63)

### Zven

- *who:* Gladias and Seila's younger son. (ch 1; c1-b110, c1-b125)
- *changes:* Wins a Helisport game; stays in touch with Lily and learns where she is. (ch 26; c11-b82, c24-b14, c26-b62, c11-b26)

### Febric

- *who:* Teenage son of Vil and Daia, the co-family; studies computer science. (ch 17; c1-b111, c1-b125, c17-b104)

### Hreda

- *who:* Daughter of Vil and Daia; good at mathematics. (ch 17; c1-b125, c13-b55, c17-b103)

### Febric

- *changes:* With Hreda, takes refuge in Northglade's Greater Plum Harbor when Northshore is invaded. (ch 20; c20-b10, c20-b8)

### Vil

- *who:* Uncle Vil, co-parent with Aunt Daia; part of a class action by Jump's former employees against the hedge fund Divergent. (ch 11; c1-b125, c11-b16, c11-b18, c11-b14)

### Jahn

- *who:* Seila's friend in Freetown, a researcher at the Freetown Economics Institute. (ch 10; c5-b58, c10-b2)
- *changes:* Introduces Zei to Freetown's defense companies through the Institute's director. (ch 22; c22-b71, c22-b72)

### Verdow

- *who:* A Veridian senator who questioned Gladias at his hearing. (ch 17; c8-b50, c17-b11, c8-b51)
- *changes:* Proposes using the courts to replace the failed military leadership. (ch 25; c25-b111, c25-b112, c25-b109, c25-b110)

### Lord Ephelion

- *who:* The Arctic ambassador to Veridia, who argues that only economic growth compounds. (ch 8; c8-b17, c8-b35, c8-b31)

### Sylka

- *who:* President of Veridia National University, who debates Ephelion. (ch 8; c8-b17)

### Lektor

- *who:* A respected Veridian general who becomes head general and commands the battle for Northshore. (ch 29; c28-b7, c28-b96, c29-b21, c29-b82)

### Evelor

- *who:* The founder of Silverchat. (ch 27; c27-b21, c27-b37)

### Tafindel

- *who:* The son of Redshire's president, held by the Arctics and rescued by the Kungaupei. (ch 26; c15-b10, c26-b88, c26-b151, c26-b158)

### Min

- *who:* Zei's mother; Freetown is her first trip abroad. (ch 5; c5-b4, c5-b7, c5-b1)

### Su

- *who:* A Minpentai priest and an organizer of the nationals. (ch 12; c12-b14, c12-b16, c12-b13)

## Places

### Veridia

- A country of trees and medieval-style stone houses; its capital is Meldan. (ch 1; c1-b2, c1-b3)

### Meldan

- Veridia's capital, with the forest-like Kalimar district, sky bridges and a tree-covered mountain. (ch 1; c1-b3, c1-b11, c1-b13)

### Greater Plum Harbor

- A walled enclave in Meldan, "almost like a country inside a country"; many Veridians push its land taxes up. (ch 3; c3-b48, c3-b57, c3-b64, c3-b1)
- Its buildings are uniform, futuristic glass and steel, unlike the rest of Veridia. (ch 3; c3-b72)

### Dzego

- A country that lost a war to the Arctics a century ago and grows its strength in small, spread-out workshops. (ch 9; c2-b128, c9-b29)

### Pafogai Du

- A Dzego city of small electronics shops and factories on a regular street grid. (ch 4; c2-b3, c4-b53, c2-b1)
- A half-kilometer pyramid at its southern edge is a refurbished mountain holding part of the government. (ch 4; c4-b48, c4-b49)

### Sadzu Du

- Dzego's capital; the name means "main city". (ch 12; c12-b5, c12-b6, c12-b1)

### United Cities

- Cities that elect a share of each other's parliaments, called co-governance. (ch 5; c5-b47)

### Freetown

- A city of the United Cities, mixed rich and run-down, with the Freetown Economics Institute. (ch 5; c5-b1, c5-b16, c5-b39)

### Redshire

- A country of castles, pine forests and red snowy mountains. (ch 15; c14-b124, c15-b10)
- Invaded and annexed by the Arctic Empire. (ch 15; c15-b6)

### Northglade

- A Veridian town in the province of Northshore, near the Arctic border, with Veridia's best math university. (ch 20; c17-b100, c17-b103, c20-b8)
- Taken by the Arctics, except its Greater Plum Harbor, which they leave alone. (ch 20; c20-b5, c20-b8)

### Thaldur

- An island of the Arctic core territory east of Northshore, taken by Veridian sea drones. (ch 30; c29-b29, c30-b74)

### Glasscrown

- An Arctic city like a giant ice crystal, with a kilometer-tall tower. (ch 31; c31-b42, c31-b23)

### Elenar Forest

- Snowy pine forest in Veridia where the battle for Northshore begins. (ch 29; c29-b1, c29-b2, c29-b13)

## Institutions

### Order of Steering

- A government-linked, decentralized collective that sets Veridia's taxes and subsidies instead of bans. (ch 1; c1-b56)
- Keepers vote on tax rubrics; Sentinels audit businesses; Acolytes are members in training. (ch 1; c1-b57)
- Anyone can guess a member's task for a bounty, so members keep their roles private. (ch 1; c1-b76)
- Each rubric has twenty-one Keepers in three groups of seven that discuss separately and don't know who is in the other groups; thirteen votes pass a change. (ch 23; c23-b60, c7-b130)

### Heralds

- Order members picked at random to retire and explain the Order to the public, transparent only once they have no power. (ch 6; c6-b73, c6-b74)

### Courts

- Five judges per case, chosen at random from a large pool and anonymous; an appeal draws a new sample. (ch 23; c6-b41, c23-b63, c7-b130)

### Graph Funding

- Public funding split down a graph, each node's share decided by a randomly selected committee. (ch 17; c17-b55, c17-b60)

### Quadratic Funding

- Public matching of donations; attacked by Bluewhale and later at larger scale by the Arctics. (ch 17; c11-b113, c17-b56)

### Parliament

- Veridia's transparent parliament; a committee of twenty senators approves new Order members. (ch 8; c8-b43, c8-b47, c7-b131)

### Citizens' assemblies

- Public meetings, some run by Heralds, whose results Keepers check when debating rubrics. (ch 6; c6-b68, c6-b94, c6-b75, c6-b76)

### DU

- Dzego's Decentralized University, which runs by anonymous cryptographic coordination. (ch 2; c2-b21, c2-b128, c2-b1)

### Bansunpei

- The priests who keep improving the Dzegoban language, testing versions across the country. (ch 9; c4-b27, c4-b44, c9-b34)

### Kungaupei

- Dzego's secret society for defense, a shadow army. (ch 9; c9-b56, c9-b57)

## Technology

### Privacy robe

- The Veridian privacy robe: a loose dark purple garment covering the body from hood to ankles. (ch 1; c1-b45)

### Neck band

- A band that picks up silent, whispered speech. (ch 1; c1-b12)

### Emerald

- The local AI on Gladias's hand device. (ch 1; c1-b9)

### Zero-knowledge proofs

- Watches and gates verify devices and credentials while learning nothing else. (ch 1; c1-b4, c1-b43)

### Anti-transmission foil

- A common material lining rooms to block wireless signals. (ch 2; c2-b4)

### Mixnet

- Messages, and in Dzego even parcels, pass through three randomly chosen nodes so no one sees both sender and receiver. (ch 9; c9-b115, c9-b116, c9-b122, c9-b121, c9-b123)

### Security cameras

- In Dzego anyone may unscrew a public camera and inspect it, so cameras can be trusted. (ch 9; c5-b79, c9-b97)

### Zipcoins

- The currency; payments and even sales tax are zero-knowledge. (ch 6; c6-b135, c6-b138)

### Time

- A hundred ticks a minute, a hundred minutes a longhour, ten longhours a day. (ch 9; c9-b37)

### Silverchat and Bluewhale

- Veridia's two big social platforms: Silverchat open to other clients, Bluewhale closed. (ch 3; c3-b19, c3-b24)

### Hydrafill

- A drinks brand known for its odd, funny advertisements. (ch 3; c1-b93, c3-b46)

## Minpentai

### Minpentai

- A strategy game played on a board of walls, gliders and ships carrying each player's symbol. (ch 4; c4-b84, c4-b93, c4-b111, c4-b7, c4-b88)
- Its rules are time-reversible, so anything that can be built can be destroyed. (ch 4; c4-b9, c4-b13, c4-b7)
- Each match has a new rule chosen by priests. (ch 4; c4-b84, c4-b148)
- Intervention turns let players add squares near their symbols. (ch 4; c4-b110, c4-b88)
- Really military training: a way to raise defenders, safe because it looks like a game. (ch 10; c10-b192, c10-b194, c10-b202)
- Its players sit in Veridia's command centres and help run the drones in the battle for Northshore. (ch 29; c29-b42, c29-b71, c29-b13)

## Factions

### Arctic Empire

- The most technologically advanced power; its aim is to keep Dzego's industry and technology down. (ch 10; c10-b145, c2-b127)
- Its ideology rates people by intelligence and treats love as a reward for winning. (ch 24; c18-b124, c24-b42)
- Smuggles surveillance devices into Veridia and corrupts officials. (ch 24; c3-b30, c24-b79)
- Invades Redshire, then Northglade. (ch 20; c15-b6, c20-b5)

### Dzego

- Its slogan, "grow roots, no head": spread-out manufacturing and anonymous coordination with no leaders to target. (ch 2; c2-b8, c2-b128)
- "Dze go ba fau gie": Dzego will rise again. (ch 2; c2-b130, c2-b131)

### Freetown's defense companies

- Arm after Redshire, and later help Dzego hunt Arctic drones. (ch 22; c10-b24, c22-b20, c22-b76, c22-b74)

### Silverchat

- The more open social platform, which Delwart claims to work for. (ch 16; c3-b24, c16-b13, c16-b10)

## Timeline

- **3724 Snowmoon 3.** Meldan: Gladias rates a band as an Acolyte, escapes being exposed, and gets an anonymous request. (ch 1; c1-b1, c1-b71, c1-b73, c1-b140, c1-b58, c1-b85)

- **3724 Snowmoon 5.** Pafogai Du: a blast hits Zei and Fin's class; Zei's arm is broken. (ch 5; c2-b1, c2-b98, c2-b112, c2-b2, c2-b100, c5-b72)

- **3724 Snowmoon 8.** Meldan: Gladias meets Delwart, who urges him to become a Keeper. (ch 3; c3-b1, c3-b87, c3-b112, c3-b88)

- **3724 Snowmoon 24.** Pafogai Du: Zei and Bai win a quarter final together. (ch 4; c4-b1, c4-b90, c4-b141, c4-b145)

- **3724 Rainmoon 11.** Freetown: Zei, Min and Bai meet Seila and Jahn. (ch 5; c5-b1, c5-b58, c5-b4, c5-b56, c5-b57)

- **3724 Rainmoon 12–13.** Meldan: Gladias applies to become a Keeper. (ch 6; c6-b1, c6-b47, c6-b158, c6-b149)

- **3724 Rainmoon 24.** Pafogai Du: a chip factory is hit; Bai resigns and Zei wins the city final. (ch 7; c7-b22, c7-b37, c7-b120, c7-b33, c7-b61)

- **3724 Rainmoon 26.** Meldan: Gladias is accepted into the Order; Mov becomes a Herald. (ch 8; c8-b1, c8-b101, c8-b134, c8-b129)

- **3724 Rainmoon 28.** Pafogai Du: Den recruits Zei into defense. (ch 9; c9-b1, c9-b73, c9-b56, c9-b137)

- **3724 Windmoon 24.** Freetown prepares; Gladias attends his first Keeper meetings; Zei learns Minpentai is military training. (ch 10; c10-b1, c10-b24, c10-b30, c10-b194, c10-b29, c10-b175)

- **3724 Bloomtime 15.** Meldan: Zven wins at Helisport. (ch 11; c11-b1, c11-b82, c11-b5, c11-b26)

- **3724 Grasstime 22–25.** Sadzu Du: the national championship begins; Zei meets Deluin. (ch 12; c12-b1, c12-b71, c12-b96, c12-b73, c12-b84)

- **3724 Harvestmoon 8–9.** Meldan: Mov finds Delwart has contacts in two discussion groups of one rubric; Gladias's group agrees to wait two months. (ch 13; c13-b1, c13-b38, c13-b71, c13-b99, c13-b30, c13-b35, c13-b100)

- **3724 Firemoon 10.** Sadzu Du: Zei and Deluin win their semi finals. (ch 14; c14-b1, c14-b87, c14-b94, c14-b30)

- **3724 Firemoon 17.** The Arctic Empire invades and annexes Redshire; the final is cancelled. (ch 15; c15-b1, c15-b6, c15-b82)

- **3724 Firemoon 25.** Meldan: Delwart claims to work for Silverchat. (ch 16; c16-b1, c16-b13, c16-b10)

- **3724 Fruitmoon 11.** Meldan: the Keepers vote on the hardware openness rubric. (ch 17; c17-b1, c17-b111, c17-b85, c17-b110)

- **3724 Fruitmoon 18.** Pafogai Du: Gladias arrives in Dzego. (ch 18; c18-b1, c18-b2)

- **3724 Grapetime 15.** Pafogai Du: Deluin's letter reaches Zei. (ch 19; c19-b1, c19-b153)

- **3724 Mistime 10.** The Arctic Empire invades Northglade; Seila finds Delwart is not from Silverchat. (ch 20; c20-b1, c20-b5, c20-b179, c20-b177)

- **3724 Mistime 20.** Meldan: Seila concludes Delwart is an Arctic. (ch 21; c21-b1, c21-b71, c21-b49)

- **3724 Mistime 22.** Freetown and Pafogai Du: drone hunts in Redshire; Lily runs away. (ch 23; c22-b1, c22-b76, c23-b1, c23-b91, c22-b74, c23-b79)

- **3724 Mistime 27.** Pafogai Du: Gladias proposes that Dzego spy on Veridia's spies. (ch 24; c24-b1, c24-b76, c24-b64, c24-b72)

- **3724 Frostime 1.** Pafogai Du: the plan to persuade Veridia's courts. (ch 25; c25-b1, c25-b102)

- **3724 Frostime 5–6.** Veridia: Tafindel is rescued; the judges refuse the case. (ch 26; c26-b1, c26-b78, c26-b151, c26-b192, c26-b88, c26-b162, c26-b173, c26-b158)

- **3724 Frostime 7–8.** Meldan: the Silverchat poll and the forecasting bots. (ch 27; c27-b1, c27-b98, c27-b120, c27-b136)

- **3724 Frostime 15–18.** Meldan: Lektor becomes head general. (ch 28; c28-b1, c28-b90, c28-b96)

- **3725 Snowmoon 29–30.** Elenar Forest: the battle for Northshore. (ch 30; c29-b1, c29-b54, c30-b1, c29-b13)

- **3725 Snowmoon 30.** Northglade is retaken and Thaldur taken. (ch 30; c30-b71, c30-b74, c30-b75)

- **3725 Rainmoon 2.** Northglade: Zei meets Deluin; Gladias's family is reunited. (ch 31; c31-b1, c31-b7, c31-b79, c31-b77, c31-b10)

- **3725 Rainmoon 12.** Meldan: Verdow warns this was only the first round. (ch 32; c32-b1, c32-b29, c32-b12)
