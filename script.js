let states=[]
let alphabet=[]
let start=""
let finals=[]
let transitions={}

let cy
let minCy
let compareCy
let compareMinCy

let selectedState=null
let selectedSymbol=null

// Helpers + cached results for minimization rendering
let stateIndex={}
let minimizedClasses=[]
let stateToMinClassId={}
let minClassLabelById={}
let startMinClassId=null
let minTransitions={} // minTransitions[minClassId][symbol] = minClassId
let minFinalClassIds=new Set()

let animationCancelToken=0

// For pair/triangle hover vs click persistence.
let pairSelectionSig=null

// Comparison section interaction: hover/click a node highlights its corresponding class.
let compareMemberToMinIds={}
let compareMinIdToMembers={}
let compareSelected=null // {type:'og'|'min', id:string}

// Minimization runs on the reachable sub-DFA only (standard DFA minimization step).
let algoStates=[]
let algoFinalSet=new Set()

function createDFA(){
try{let rawStates=document.getElementById("states").value.trim()
let rawAlphabet=document.getElementById("alphabet").value.trim()
let rawStart=document.getElementById("start").value.trim()
let rawFinals=document.getElementById("finals").value.trim()

// ❌ REQUIRED FIELD VALIDATION
if(!rawStates || !rawAlphabet || !rawStart){
alert("Please fill all required fields: States, Alphabet, and Start State.")
return
}

// Parse inputs
states=rawStates.split(",").map(s=>s.trim()).filter(s=>s)
alphabet=rawAlphabet.split(",").map(s=>s.trim()).filter(s=>s)

let startInput=rawStart.split(",").map(s=>s.trim()).filter(s=>s)

// ❌ Only ONE start state
if(startInput.length!==1){
alert("Exactly ONE start state is required.")
return
}

start=startInput[0]

// Finals optional
finals=rawFinals
? rawFinals.split(",").map(s=>s.trim()).filter(s=>s)
: []

// ❌ VALIDATE STATES EXIST
if(!states.includes(start)){
alert("Start state must be one of the defined states.")
return
}

for(let f of finals){
if(!states.includes(f)){
alert("Final state '"+f+"' is not in the defined states.")
return
}
}
stateIndex={}
states.forEach((s,i)=>stateIndex[s]=i)
minimizedClasses=[]
stateToMinClassId={}
minClassLabelById={}
minTransitions={}
startMinClassId=null
transitions={}
states.forEach(s=>transitions[s]={})

buildTable()
initGraph()

// Force Cytoscape to size correctly immediately (prevents slow "growing" look).
requestAnimationFrame(()=>{
if(!cy) return
cy.resize()
cy.fit()
})
setTimeout(()=>{
if(!cy) return
cy.resize()
cy.fit()
}, 60)

// Clear minimized UI until the user runs minimization again.
document.getElementById("minSection").style.display="none"
document.getElementById("pairList").innerText=""
document.getElementById("pairTable").innerHTML=""
document.getElementById("iterations").innerHTML=""
document.getElementById("equivalent").innerText=""
document.getElementById("minTable").innerHTML=""
document.getElementById("compareStats").innerHTML=""
document.getElementById("compareRegex").innerHTML=""
document.getElementById("stringResult").innerHTML=""

if(minCy){
minCy.destroy()
minCy=null
}
if(compareCy){
compareCy.destroy()
compareCy=null
}
if(compareMinCy){
compareMinCy.destroy()
compareMinCy=null
}
}catch(err){
console.error(err)
alert("createDFA error: "+(err && err.message ? err.message : err))
}

}

function buildTable(){

let table=document.getElementById("table")
table.innerHTML=""

let header="<tr><th>State</th>"
alphabet.forEach(a=>header+="<th>"+a+"</th>")
header+="</tr>"

table.innerHTML+=header

states.forEach(s=>{

let row="<tr><td>"+s+"</td>"

alphabet.forEach(a=>{

row+=`
<td>
<select onchange="setTransition('${s}','${a}',this.value)">
<option value="">-</option>
${states.map(st=>`<option value="${st}">${st}</option>`).join("")}
</select>
</td>
`

})

row+="</tr>"
table.innerHTML+=row

})

}

function setTransition(s,a,t){
transitions[s][a]=t
drawGraph()
}

function initGraph(){

cy=cytoscape({

container:document.getElementById("cy"),

style:[

{
selector:"node",
style:{
"label":"data(label)",
"text-valign":"center",
"text-halign":"center",
"font-size":"16px",
"background-color":"#4a6cf7",
"color":"white",
"border-width":1,
"border-color":"#2d3436",
"border-style":"solid",
"outline-width":0,
"outline-color":"#111",
"outline-style":"solid",
"outline-offset":2
}
},

{
selector:"edge",
style:{
"curve-style":"bezier",
"target-arrow-shape":"triangle",
label:"data(label)"
}
},

{
selector:".active",
style:{
"border-width":4,
"border-color":"#ff4fd8",
"outline-width":6,
"outline-color":"rgba(255,79,216,0.35)"
}
},
{
selector:".activeTemp",
style:{
"border-width":3,
"border-color":"#ff4fd8",
"outline-width":5,
"outline-color":"rgba(255,79,216,0.25)"
}
},
{
selector:".activeEdge",
style:{
"line-color":"#ff4fd8",
"target-arrow-color":"#ff4fd8",
"width":6
}
},
{
selector:".compareYellow",
style:{
"background-color":"#ffd54a",
"border-color":"#ffd54a",
"border-width":3,
"outline-width":7,
"outline-color":"rgba(255,213,74,0.45)"
}
}
]

})

// Make right-click work on the canvas (so Cytoscape can handle cxttap events).
cy.container().addEventListener("contextmenu", function(e){
e.preventDefault()
})

cy.on("tap","node",function(evt){

let node=evt.target.id()

if(!selectedState){

selectedState=node
selectedSymbol=prompt("Symbol: "+alphabet.join(","))

if(!selectedSymbol || !alphabet.includes(selectedSymbol)){
alert("Pick a valid symbol from: "+alphabet.join(", "))
selectedState=null
selectedSymbol=null
return
}

}else{

transitions[selectedState][selectedSymbol]=node

selectedState=null
selectedSymbol=null

updateTable()
drawGraph()

}

})

// Right-click (context tap) on a transition edge to delete it.
cy.on("cxttap","edge",function(evt){
let data=evt.target.data()
if(data && data.kind==="start-indicator") return
if(data && data.kind==="transition" && data.from && data.symbol && transitions[data.from]){
delete transitions[data.from][data.symbol]
updateTable()
drawGraph()
}
})

drawGraph()

}

function addStartIndicator(instanceCy, startId){
// Adds an extra arrow pointing at the start state without touching transitions.
if(!startId) return
let startNode=instanceCy.getElementById(startId)
if(!startNode || startNode.empty()) return
let pos=startNode.position()

let indicatorId="__start_indicator__"
instanceCy.add({
group:"nodes",
data:{id:indicatorId,kind:"start-indicator",label:""},
position:{x:pos.x-90,y:pos.y},
style:{
"background-opacity":0,
"border-width":0,
"outline-width":0,
"width":1,
"height":1,
"opacity":0,
"events":false,
"label":""
}
})

instanceCy.add({
group:"edges",
data:{id:"__start_arrow__",kind:"start-indicator",source:indicatorId,target:startId,label:""},
style:{
"curve-style":"straight",
"line-color":"#e67e22",
"width":4,
"target-arrow-shape":"triangle",
"label":""
}
})
}

function drawGraph(){

cy.elements().remove()

states.forEach(s=>{

let isFinal=finals.includes(s)
let color=(s===start)?"#2ecc71":"#4a6cf7"

cy.add({
group:"nodes",
data:{id:s,label:s},
style:{
"background-color":color,
"border-width":isFinal?2:1,
"border-color":isFinal?"#e67e22":"#2d3436",
"outline-width":isFinal?4:0,
"outline-color":"#e67e22",
"outline-offset":2
}
})

})

states.forEach(s=>{
alphabet.forEach(a=>{

let t=transitions[s][a]
if(!t) return

cy.add({
group:"edges",
data:{
id:s+a+t,
source:s,
target:t,
label:a,
from:s,
symbol:a,
to:t,
kind:"transition"
}
})

})
})

cy.layout({name:"circle"}).run()
addStartIndicator(cy,start)

}

function updateTable(){

let table=document.getElementById("table")

for(let i=1;i<table.rows.length;i++){

let s=table.rows[i].cells[0].innerText

for(let j=1;j<table.rows[0].cells.length;j++){

let a=table.rows[0].cells[j].innerText

let sel=table.rows[i].cells[j].querySelector("select")

sel.value=transitions[s][a]||""

}

}

}

function resetView(){
if(cy) cy.fit()
}

function validateDFA(){

for(let s of states)
for(let a of alphabet)
if(!transitions[s][a]){
alert("Missing transition "+s+" on "+a)
return false
}

return true

}

function generateRandomDFA(){

states.forEach(s=>{
alphabet.forEach(a=>{
transitions[s][a]=states[Math.floor(Math.random()*states.length)]
})
})

updateTable()
drawGraph()

}

function pairKey(a,b){
// Order the pair consistently using `states` index so the marking table is correct.
if(a===b) return a+","+b
let i=stateIndex[a]
let j=stateIndex[b]
if(i===undefined || j===undefined) return a+","+b
return i<j ? a+","+b : b+","+a
}

function startMinimization(){

document.getElementById("minSection").style.display="block"

document.getElementById("pairList").innerText=""
document.getElementById("pairTable").innerHTML=""
document.getElementById("iterations").innerHTML=""
document.getElementById("equivalent").innerText=""
document.getElementById("minTable").innerHTML=""

if(minCy){
minCy.destroy()
minCy=null
}

if(!validateDFA()) return

// Compute reachable sub-DFA to remove useless/unreachable states.
algoStates=[]
algoFinalSet=new Set()
let reachable=computeReachableFromStart()
algoStates=states.filter(s=>reachable.has(s))
algoStates.forEach(s=>{
if(finals.includes(s)) algoFinalSet.add(s)
})

// Safety fallback (shouldn't happen because `start` is reachable by definition).
if(algoStates.length===0){
algoStates=[start]
algoFinalSet=new Set(finals.includes(start)?[start]:[])
}

// UI: show which states were removed as unreachable.
let removed=states.filter(s=>!reachable.has(s))
let reachText="{"+algoStates.join(", ")+"}"
let removedText=removed.length?("{"+removed.join(", ")+"}"):"{}"
document.getElementById("reachableInfo").innerHTML=
`<b>Reachable from start:</b> ${reachText}<br>`+
`<b>Removed unreachable states:</b> ${removedText}`

let pairs=[]
let marked={}

for(let i=0;i<algoStates.length;i++)
for(let j=i+1;j<algoStates.length;j++){

pairs.push([algoStates[i],algoStates[j]])
marked[pairKey(algoStates[i],algoStates[j])]=false

}

showPairs(pairs)
runAlgorithm(pairs,marked)

}

function computeReachableFromStart(){
let reachable=new Set()
let q=[]
if(!start) return reachable
reachable.add(start)
q.push(start)
while(q.length){
let s=q.shift()
for(let sym of alphabet){
let t=transitions?.[s]?.[sym]
if(!t) continue
if(!reachable.has(t)){
reachable.add(t)
q.push(t)
}
}
}
return reachable
}

function runAlgorithm(pairs,marked){

let html=""

let step=0
html+=iterationCard("Step 0","Initial table: no pairs marked",marked,new Set())
step++

let initiallyMarked=[]

pairs.forEach(([a,b])=>{
if(algoFinalSet.has(a)!==algoFinalSet.has(b)){
marked[pairKey(a,b)]=true
initiallyMarked.push([a,b])
}
})

if(initiallyMarked.length>0){
let initiallyMarkedKeys=new Set(initiallyMarked.map(([x,y])=>pairKey(x,y)))
let preview=initiallyMarked.slice(0,6).map(p=>`(${p[0]},${p[1]})`).join(", ")
let suffix=initiallyMarked.length>6?" ...":""
html+=iterationCard(
"Step "+step,
`Initial marking (final vs non-final): marked ${initiallyMarked.length} pairs. Example: ${preview}${suffix}`,
marked,
initiallyMarkedKeys
)
step++
}

html+=iterationCard(
"Step "+step,
"Now the algorithm scans every unmarked pair one-by-one. If any symbol sends them to an already marked pair, we mark that pair too.",
marked
)
step++

let changed=true

while(changed){

changed=false

pairs.forEach(([a,b])=>{

if(marked[pairKey(a,b)]) return

for(let sym of alphabet){

let t1=transitions[a][sym]
let t2=transitions[b][sym]

let key=pairKey(t1,t2)

if(marked[key]){

let newlyMarkedKey=pairKey(a,b)
marked[newlyMarkedKey]=true
changed=true

html+=iterationCard(
"Step "+step,
`(${a},${b}) marked because δ(${a},${sym})=${t1} and δ(${b},${sym})=${t2}`,
marked,
new Set([newlyMarkedKey]))
step++

break

}

}

})

}

let remaining=pairs.filter(([a,b])=>!marked[pairKey(a,b)]).map(([a,b])=>`(${a},${b})`)
if(remaining.length>0){
html+=iterationCard(
"Step "+step,
`Unmarked pairs remain equivalent: ${remaining.join(", ")}. They stayed unmarked because no input symbol could distinguish them from each other.`,
marked
)
}

drawTriangle(marked)
document.getElementById("iterations").innerHTML=html
applyStepRevealAnimation()

computeClasses(pairs,marked)

}

function applyStepRevealAnimation(){
let cards=[...document.querySelectorAll(".iterationCard")]
if(cards.length===0) return
let observer=new IntersectionObserver((entries)=>{
entries.forEach(entry=>{
if(entry.isIntersecting){
entry.target.classList.add("revealed")
}
})
},{threshold:0.45})
cards.forEach(c=>observer.observe(c))
}

function computeClasses(pairs,marked){
let parent={}

algoStates.forEach(s=>parent[s]=s)

function find(x){
while(parent[x]!=x) x=parent[x]
return x
}

function union(a,b){
a=find(a)
b=find(b)
if(a!=b) parent[b]=a
}

// Union all unmarked pairs into the same equivalence class.
pairs.forEach(([a,b])=>{
if(!marked[pairKey(a,b)]) union(a,b)
})

let groups={}
algoStates.forEach(s=>{
let root=find(s)
if(!groups[root]) groups[root]=[]
groups[root].push(s)
})

// Stable presentation ordering.
let classes=Object.values(groups).map(m=>m.slice())
classes.forEach(c=>c.sort((x,y)=>stateIndex[x]-stateIndex[y]))
classes.sort((c1,c2)=>stateIndex[c1[0]]-stateIndex[c2[0]])

minimizedClasses = classes.map((members, idx)=>({
id:"Q"+idx,
members
}))

stateToMinClassId={}
minimizedClasses.forEach(c=>{
c.members.forEach(s=>stateToMinClassId[s]=c.id)
})

startMinClassId=stateToMinClassId[start]
minClassLabelById={}
minimizedClasses.forEach(c=>{
minClassLabelById[c.id]="{"+c.members.join(",")+"}"
})

minFinalClassIds=new Set()
minimizedClasses.forEach(c=>{
if(c.members.some(s=>algoFinalSet.has(s))) minFinalClassIds.add(c.id)
})

minTransitions={}
minimizedClasses.forEach(c=>{
let rep=c.members[0]
minTransitions[c.id]={}
alphabet.forEach(sym=>{
let t=transitions[rep][sym]
minTransitions[c.id][sym]=stateToMinClassId[t]
})
})

let eqHtml="<div class='eq-heading'>states minimized</div>"
minimizedClasses.forEach(c=>{
let left=c.members.map(s=>"{"+s+"}").join("+")
let right=c.members.map(s=>"<b>"+s+"</b>").join(", ")
eqHtml+="<div class='eq-row'>"+left+" &#8594; {"+right+"}</div>"
})
document.getElementById("equivalent").innerHTML=eqHtml

drawMinimized()
drawComparison()
}

function drawMinimized(){

if(minCy){
minCy.destroy()
minCy=null
}

minCy=cytoscape({
container:document.getElementById("minGraph"),
style:[
{
selector:"node",
style:{
label:"data(label)",
"text-valign":"center",
"text-halign":"center",
"font-size":"14px",
"background-color":"#4a6cf7",
"color":"white",
"border-width":1,
"border-color":"#2d3436",
"border-style":"solid",
"outline-width":0,
"outline-color":"#111",
"outline-style":"solid",
"outline-offset":2
}
},
{
selector:"edge",
style:{
label:"data(label)",
"curve-style":"bezier",
"target-arrow-shape":"triangle"
}
},
{
selector:".active",
style:{
"border-width":4,
"border-color":"#ff4fd8",
"outline-width":6,
"outline-color":"rgba(255,79,216,0.35)"
}
},
{
selector:".activeTemp",
style:{
"border-width":3,
"border-color":"#ff4fd8",
"outline-width":5,
"outline-color":"rgba(255,79,216,0.25)"
}
},
{
selector:".activeEdge",
style:{
"line-color":"#ff4fd8",
"target-arrow-color":"#ff4fd8",
"width":6
}
}
]
})

minimizedClasses.forEach(c=>{
let isStart=c.id===startMinClassId
let isFinal=c.members.some(s=>algoFinalSet.has(s))
 let bg=isStart?"#2ecc71":"#4a6cf7"

minCy.add({
group:"nodes",
data:{id:c.id,label:minClassLabelById[c.id]},
style:{
"background-color":bg,
"border-width":isFinal?2:1,
"border-color":isFinal?"#e67e22":"#2d3436",
"outline-width":isFinal?4:0,
"outline-color":"#e67e22",
"outline-offset":2
}
})
})

minimizedClasses.forEach(from=>{
alphabet.forEach(sym=>{
let to=minTransitions[from.id][sym]
if(!to) return
minCy.add({
group:"edges",
data:{
id:from.id+"|"+sym+"|"+to,
source:from.id,
target:to,
label:sym,
from:from.id,
symbol:sym,
to:to,
kind:"transition"
}
})
})
})

minCy.layout({name:"circle"}).run()
addStartIndicator(minCy,startMinClassId)
minCy.fit()
buildMinTable()

}

function drawComparison(){
drawCompareOriginal()
drawCompareMinimized()

let ogTransitionCount=states.length*alphabet.length
let minTransitionCount=minimizedClasses.length*alphabet.length
document.getElementById("compareStats").innerHTML=
`<b>State Count:</b> Original ${states.length} vs Minimized ${minimizedClasses.length}<br>`+
`<b>Transition Count:</b> Original ${ogTransitionCount} vs Minimized ${minTransitionCount}`

let ogRegex=buildRegexArden({
localStates:states,
localStart:start,
localFinals:finals,
localDelta:(q,sym)=>transitions[q][sym]
})

let minRegex=buildRegexArden({
localStates:minimizedClasses.map(c=>c.id),
localStart:startMinClassId,
localFinals:minimizedClasses.filter(c=>c.members.some(s=>finals.includes(s))).map(c=>c.id),
localDelta:(q,sym)=>minTransitions[q][sym]
})

document.getElementById("compareRegex").innerHTML=
`<b>Regex (Arden method, simplified):</b>`+
`<div><b>Original</b><pre class="regex-block">${formatRegexDisplay(ogRegex)}</pre></div>`+
`<div><b>Minimized</b><pre class="regex-block">${formatRegexDisplay(minRegex)}</pre></div>`

compareMinIdToMembers={}
compareMemberToMinIds={}
minimizedClasses.forEach(c=>{
compareMinIdToMembers[c.id]=c.members
c.members.forEach(m=>{
if(!compareMemberToMinIds[m]) compareMemberToMinIds[m]=[]
compareMemberToMinIds[m].push(c.id)
})
})

compareSelected=null
setupCompareInteractivity()
}

function clearCompareYellow(){
if(compareCy) compareCy.elements().removeClass("compareYellow")
if(compareMinCy) compareMinCy.elements().removeClass("compareYellow")
}

function highlightCompareByOg(ogId){
if(!compareCy || !compareMinCy) return
clearCompareYellow()
compareCy.getElementById(ogId).addClass("compareYellow")
(compareMemberToMinIds[ogId]||[]).forEach(minId=>{
compareMinCy.getElementById(minId).addClass("compareYellow")
})
}

function highlightCompareByMin(minId){
if(!compareCy || !compareMinCy) return
clearCompareYellow()
compareMinCy.getElementById(minId).addClass("compareYellow")
let members=compareMinIdToMembers[minId]||[]
members.forEach(m=>{
compareCy.getElementById(m).addClass("compareYellow")
})
}

function setupCompareInteractivity(){
if(!compareCy || !compareMinCy) return

let ignoreStart = (node)=>{
let d=node.data()
return d && d.kind==="start-indicator"
}

compareCy.on("mouseover","node",function(evt){
let node=evt.target
if(ignoreStart(node)) return
let id=node.id()
if(id) highlightCompareByOg(id)
})
compareCy.on("mouseout","node",function(evt){
let node=evt.target
if(ignoreStart(node)) return
if(compareSelected && compareSelected.type==="og") highlightCompareByOg(compareSelected.id)
else if(compareSelected && compareSelected.type==="min") highlightCompareByMin(compareSelected.id)
else clearCompareYellow()
})
compareCy.on("tap","node",function(evt){
let node=evt.target
if(ignoreStart(node)) return
let id=node.id()
compareSelected={type:"og",id:id}
highlightCompareByOg(id)
})

compareMinCy.on("mouseover","node",function(evt){
let node=evt.target
if(ignoreStart(node)) return
let id=node.id()
if(id) highlightCompareByMin(id)
})
compareMinCy.on("mouseout","node",function(evt){
let node=evt.target
if(ignoreStart(node)) return
if(compareSelected && compareSelected.type==="min") highlightCompareByMin(compareSelected.id)
else if(compareSelected && compareSelected.type==="og") highlightCompareByOg(compareSelected.id)
else clearCompareYellow()
})
compareMinCy.on("tap","node",function(evt){
let node=evt.target
if(ignoreStart(node)) return
let id=node.id()
compareSelected={type:"min",id:id}
highlightCompareByMin(id)
})
}

function drawCompareOriginal(){
if(compareCy){
compareCy.destroy()
compareCy=null
}

compareCy=cytoscape({
container:document.getElementById("compareOgGraph"),
style: cy.style().json()
})
populateGraph(compareCy,states,start,finals,transitions)
}

function drawCompareMinimized(){
if(compareMinCy){
compareMinCy.destroy()
compareMinCy=null
}

compareMinCy=cytoscape({
container:document.getElementById("compareMinGraph"),
style: minCy.style().json()
})

let ms=minimizedClasses.map(c=>c.id)
let mf=minimizedClasses.filter(c=>c.members.some(s=>finals.includes(s))).map(c=>c.id)
populateGraph(compareMinCy,ms,startMinClassId,mf,minTransitions,minClassLabelById)

// Min-node click/hover is handled in comparison interactivity setup.
}

function populateGraph(instance, localStates, localStart, localFinals, localTransitions, labelMap=null){
instance.elements().remove()
localStates.forEach(s=>{
let isFinal=localFinals.includes(s)
let color=(s===localStart)?"#2ecc71":"#4a6cf7"
instance.add({
group:"nodes",
data:{id:s,label:(labelMap&&labelMap[s])?labelMap[s]:s},
style:{
"background-color":color,
"border-width":isFinal?2:1,
"border-color":isFinal?"#e67e22":"#2d3436",
"outline-width":isFinal?4:0,
"outline-color":"#e67e22",
"outline-offset":2
}
})
})
localStates.forEach(s=>{
alphabet.forEach(sym=>{
let t=localTransitions[s]?.[sym]
if(!t) return
instance.add({
group:"edges",
data:{id:s+"|"+sym+"|"+t,source:s,target:t,label:sym,from:s,symbol:sym,to:t,kind:"transition"}
})
})
})
instance.layout({name:"circle"}).run()
addStartIndicator(instance,localStart)
instance.fit()
}

function highlightOriginalStates(memberStates, transient=false){
let allInstances=[cy,compareCy]
allInstances.forEach(inst=>{
if(!inst) return
if(transient){
// Hover: use a temp highlight and do not touch persistent selection.
memberStates.forEach(s=>inst.getElementById(s).addClass("activeTemp"))
setTimeout(()=>{
inst.elements().removeClass("activeTemp")
},650)
}else{
// Click: persist highlight.
inst.elements().removeClass("active")
inst.elements().removeClass("activeTemp")
memberStates.forEach(s=>inst.getElementById(s).addClass("active"))
}
})
}

function buildRegexArden({localStates,localStart,localFinals,localDelta}){
// Lightweight Arden-style elimination for display-quality regex.
let n=localStates.length
let idx={}
localStates.forEach((s,i)=>idx[s]=i)
let R=Array.from({length:n},()=>Array.from({length:n},()=>emptySet()))
let B=Array.from({length:n},()=>emptySet())

localStates.forEach((s,i)=>{
alphabet.forEach(sym=>{
let t=localDelta(s,sym)
if(t===undefined) return
let j=idx[t]
R[i][j]=unionRegex(R[i][j],sym)
})
if(localFinals.includes(s)) B[i]=unionRegex(B[i],epsilon())
})

for(let k=n-1;k>=0;k--){
let loop=R[k][k]
let loopStar=starRegex(loop)
B[k]=concatRegex(loopStar,B[k])
for(let j=0;j<k;j++){
R[k][j]=concatRegex(loopStar,R[k][j])
}
for(let i=0;i<k;i++){
B[i]=unionRegex(B[i],concatRegex(R[i][k],B[k]))
for(let j=0;j<k;j++){
R[i][j]=unionRegex(R[i][j],concatRegex(R[i][k],R[k][j]))
}
R[i][k]=emptySet()
}
}

let out=B[idx[localStart]]
return out===emptySet()?"∅":out
}

function formatRegexDisplay(regex){
if(!regex) return ""
let chunk=86
let out=[]
for(let i=0;i<regex.length;i+=chunk){
out.push(regex.slice(i,i+chunk))
}
return out.join("\n")
}

function emptySet(){ return "∅" }
function epsilon(){ return "ε" }
function needsParens(r){ return r.includes("|") && !(r.startsWith("(")&&r.endsWith(")")) }
function wrap(r){ return needsParens(r)?"("+r+")":r }
function unionRegex(a,b){
if(a===emptySet()) return b
if(b===emptySet()) return a
if(a===b) return a
return `${a}|${b}`
}
function concatRegex(a,b){
if(a===emptySet()||b===emptySet()) return emptySet()
if(a===epsilon()) return b
if(b===epsilon()) return a
return `${wrap(a)}${wrap(b)}`
}
function starRegex(a){
if(a===emptySet()||a===epsilon()) return epsilon()
return `${wrap(a)}*`
}

function buildMinTable(){
let table=document.getElementById("minTable")
table.innerHTML=""

let header="<tr><th>Minimized State</th>"
alphabet.forEach(a=>{
header+="<th>"+a+"</th>"
})
header+="</tr>"
table.innerHTML+=header

minimizedClasses.forEach(c=>{
let label=minClassLabelById[c.id]
let isStart=c.id===startMinClassId
let isFinal=c.members.some(s=>algoFinalSet.has(s))
if(isStart) label="→ "+label
if(isFinal) label=label+" (final)"

let row="<tr><td>"+label+"</td>"
alphabet.forEach(sym=>{
let toId=minTransitions[c.id][sym]
row+="<td>"+(minClassLabelById[toId]||toId)+"</td>"
})
row+="</tr>"
table.innerHTML+=row
})
}

function resetMinimizedView(){
if(minCy) minCy.fit()
let table=document.getElementById("minTable")
if(table){
table.scrollIntoView({behavior:"smooth",block:"start"})
}
}

function randomString(){
let len=parseInt(document.getElementById("randLen")?.value||"6",10)
if(Number.isNaN(len) || len<0) len=6
if(!alphabet || alphabet.length===0){
alert("Set an alphabet first.")
return
}
let s=""
for(let i=0;i<len;i++){
s+=alphabet[Math.floor(Math.random()*alphabet.length)]
}
document.getElementById("testString").value=s
}

function testString(){
let raw=document.getElementById("testString").value.trim()
let chars=raw.split("")
if(!validateDFA()) return
if(chars.some(c=>!alphabet.includes(c))){
alert("String contains symbols not in alphabet: "+alphabet.join(", "))
return
}
animationCancelToken++
let token=animationCancelToken

let resEl=document.getElementById("stringResult")
resEl.innerHTML="Simulating..."

// Simulate original DFA
let acceptedOriginal=simulateWithAnimation({
token,
cyInstance:compareCy || cy,
startId:start,
isFinal:(id)=>finals.includes(id),
delta:(state,sym)=>transitions[state][sym],
symbols:chars
})

// Simulate minimized DFA if available
let acceptedMin=null
if(minCy && startMinClassId && Object.keys(minTransitions).length>0){
acceptedMin=simulateWithAnimation({
token,
cyInstance:compareMinCy || minCy,
startId:startMinClassId,
isFinal:(id)=>minFinalClassIds.has(id),
delta:(state,sym)=>minTransitions[state][sym],
symbols:chars
})
}

Promise.all([acceptedOriginal, acceptedMin].map(p=>p===null?Promise.resolve(null):p)).then(([a1,a2])=>{
if(token!==animationCancelToken) return
let msg="<b>Original DFA:</b> "+(a1.accepted?"ACCEPT":"REJECT")
msg+=`<br><b>Path:</b> ${a1.path.join(" -> ")}`
if(a2!==null){
msg+="<br><b>Minimized DFA:</b> "+(a2.accepted?"ACCEPT":"REJECT")
msg+=`<br><b>Minimized Path:</b> ${formatMinPath(a2.path).join(" -> ")}`
}
resEl.innerHTML=msg
})
}

function formatMinPath(path){
return path.map(id=>{
let cls=minimizedClasses.find(c=>c.id===id)
if(!cls) return id
return "["+cls.members.join(",")+"]"
})
}

function exportGraphsPNG(){
let exports=[]
if(compareCy || cy){
let img=(compareCy||cy).png({full:true,bg:"#ffffff"})
exports.push({name:"original-dfa.png",data:img})
}
if(compareMinCy || minCy){
let img=(compareMinCy||minCy).png({full:true,bg:"#ffffff"})
exports.push({name:"minimized-dfa.png",data:img})
}
if(exports.length===0){
alert("No graphs available to export yet.")
return
}
exports.forEach(file=>{
let a=document.createElement("a")
a.href=file.data
a.download=file.name
document.body.appendChild(a)
a.click()
document.body.removeChild(a)
})
}

function simulateWithAnimation({token, cyInstance, startId, isFinal, delta, symbols, delayOffsetMs=0}){
if(!cyInstance) return Promise.resolve({accepted:false,path:[]})
let localPromiseResolve=null
let p=new Promise(r=>localPromiseResolve=r)

let current=startId
let step=0
let path=[startId]

function clearClasses(){
cyInstance.elements().removeClass("active")
cyInstance.elements().removeClass("activeEdge")
}

function highlightNode(id){
cyInstance.getElementById(id).addClass("active")
}

function highlightEdge(from, sym, to){
// Try to find our labeled transition edge.
let edge=cyInstance.edges().filter(e=>{
let d=e.data()
return d && d.kind==="transition" && d.from===from && d.symbol===sym && d.to===to
})[0]
if(edge) edge.addClass("activeEdge")
}

function tick(){
if(token!==animationCancelToken){
clearClasses()
localPromiseResolve({accepted:false,path})
return
}
clearClasses()
// Short off phase makes repeated states visibly "blink".
setTimeout(()=>{
if(token!==animationCancelToken){
clearClasses()
localPromiseResolve({accepted:false,path})
return
}
highlightNode(current)

if(step>=symbols.length){
let ok=isFinal(current)
setTimeout(()=>{
if(token!==animationCancelToken) return
clearClasses()
highlightNode(current)
localPromiseResolve({accepted:ok,path})
}, 260)
return
}

let sym=symbols[step]
let next=delta(current,sym)
highlightEdge(current,sym,next)

setTimeout(()=>{
if(token!==animationCancelToken){
clearClasses()
localPromiseResolve({accepted:false,path})
return
}
current=next
path.push(next)
step++
tick()
}, 520)
}, 120)
}

setTimeout(tick, delayOffsetMs)
return p
}

function jumpToMinSection(){
let sec=document.getElementById("minSection")
if(!sec) return
sec.style.display="block"
let target=document.getElementById("minGraph") || sec
target.scrollIntoView({behavior:"smooth",block:"start"})
}

function jumpToTop(){
window.scrollTo({top:0,behavior:"smooth"})
}

function resetComparisonView(){
if(compareCy) compareCy.fit()
if(compareMinCy) compareMinCy.fit()
clearCompareYellow()
}

function resetCompareOgView(){
if(compareCy) compareCy.fit()
clearCompareYellow()
}

function resetCompareMinView(){
if(compareMinCy) compareMinCy.fit()
clearCompareYellow()
}

function showPairs(pairs){
let el=document.getElementById("pairList")
el.innerHTML=pairs.map(p=>{
let a=p[0], b=p[1]
return `<span class="pairPill" data-a="${a}" data-b="${b}">(${a},${b})</span>`
}).join("")
}

function attachPairHoverHandlers(){
let el=document.getElementById("pairList")
if(!el) return

el.onmouseover=(e)=>{
let t=e.target.closest ? e.target.closest(".pairPill") : null
if(!t || !t.dataset) return
let a=t.dataset.a, b=t.dataset.b
if(a && b) highlightOriginalStates([a,b], true)
}
el.onmouseout=(e)=>{
if(!el.contains(e.relatedTarget)){
if(!pairSelectionSig) clearOriginalHighlights()
}
}
el.onclick=(e)=>{
let t=e.target.closest ? e.target.closest(".pairPill") : null
if(!t || !t.dataset) return
let a=t.dataset.a, b=t.dataset.b
if(a && b){
pairSelectionSig=a+"|"+b
highlightOriginalStates([a,b], false)
}
}
}

function clearOriginalHighlights(){
let allInstances=[cy,compareCy]
allInstances.forEach(inst=>{
if(!inst) return
inst.elements().removeClass("activeTemp")
inst.elements().removeClass("active")
})
}

function drawTriangle(marked){
document.getElementById("pairTable").innerHTML=triangleHTML(marked, new Set())
}

function triangleHTML(marked,newMarkedKeys){
if(!newMarkedKeys) newMarkedKeys=new Set()

let html="<table>"

html+="<tr><th></th>"
algoStates.slice(1).forEach(s=>html+="<th>"+s+"</th>")
html+="</tr>"

for(let i=0;i<algoStates.length-1;i++){

html+="<tr><th>"+algoStates[i]+"</th>"

for(let j=1;j<algoStates.length;j++){

if(j<=i) html+="<td class='tri-gap'></td>"
else{

let key=pairKey(algoStates[i],algoStates[j])

let isMarked=!!marked[key]
let isNew=newMarkedKeys.has(key)
let cellClass=(isMarked?"marked":"")+(isNew?" newMarkedInStep":"")
html+=`<td class="${cellClass.trim()}" data-a="${algoStates[i]}" data-b="${algoStates[j]}">${isMarked?"X":"-"}</td>`

}

}

html+="</tr>"

}

html+="</table>"

return html

}

function iterationCard(title,text,marked,newMarkedKeys){

return `
<div class="iterationCard">
<b>${title}</b><br>
${text}
<div class="triangleWrap" style="margin-top:10px">${triangleHTML(marked,newMarkedKeys)}</div>
</div>
`

}
