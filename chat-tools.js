// 聊天按钮（v1.18.3）：底部那排改版。用户 2026-10-04 定的：
// 1. 「重新处理变量」「重新读取初始变量」不常用、还老被误触：输入框上面那排大按钮藏掉，
//    ≡ 菜单里放一个「变量」，点开一个小框，两个都在里面（点的还是卡里原来那两个按钮，功能不变）。
//    只给它们加 class 藏起来，不搬、不删（别家的按钮只标号不搬，见 AGENTS.md）。
// 2. 「深入」：输入框上面「快捷工具」那一排里的小按钮（v1.18.6 起；1.18.3 时是浮在发送按钮上面的小圆钮）。点了不用打字，给 AI 一次性加一段写法说明再出一条：
//    留在当前场景写深、按人物内核来、聪明人别降智、不写套路。说明在扩展页「聊天按钮」里能改。
//    以后要加别的小图标也往发送按钮上面叠。
// 3. 「到最底下」：≡ 菜单里一项（v1.18.4 起，用户：「也不是常用的，只是更新了以后它才会用」，原来是浮着的小圆钮）。

import { tip } from './tip.js';
import { vlog } from './var-log.js';
import { openPromptBook } from './text-editor.js';

const EXTENSION_KEY = 'chat-text-color';
const SETTINGS_ID = 'tt-chat-tools-settings';
const MENU_ID = 'option_tt_vars';
const DEEPEN_ID = 'tt-deepen-btn';
const BOTTOM_MENU_ID = 'option_tt_bottom';
const PROMPTS_MENU_ID = 'option_tt_prompts';
const PROMPT_KEY = 'tt_deepen';
const VAR_BUTTONS = ['重新处理变量', '重新读取初始变量'];
const HIDE_CLASS = 'tt-varbtn-hidden';
const EMPTY_BAR = 'tt-qrbar-empty';
const ctx = () => globalThis.SillyTavern?.getContext?.();

// v1.18.3 的第一版，用户手机上存的要是这版原样，就换成新版
const DEEPEN_V1 = `【本轮写法：原地深入】
接着上一条往下写，这一条只做一件事：把眼下这场戏写深、写活。

一、锁住场景
- 留在同一个地点、同一段时间里。不跳时间，不换地方，不引出新事件、新人物，不急着收尾或推进到下一段剧情。

二、先想人，再下笔（心里想，不要写出来）
- 对每个在场角色想清楚：此刻最想要什么、最怕什么、藏着什么没说的心思、对在场其他人的真实判断。
- 回去对照角色设定和世界书里这个人的性格内核、身份、过往和说话方式，行为从这些出发，而不是从一个标签出发。

三、聪明人要真聪明
- 精明、多疑、有城府的角色，会试探、会看穿、会留后手、会算计得失，不会被一句话糊弄，也不会为了让{{user}}好过而突然犯傻或配合。
- 每个人都在为自己的目的行事，立场之间要有真实的拉扯。

四、把性格的复杂写出来
- 写言行不一、表面和内心的反差、同时存在的矛盾冲动。
- 用动作、台词、语气、潜台词、细小的习惯动作把性格演出来，不要用旁白直接下结论（不要写「他很精明」，要写出他精明的那一下）。

五、不写套路
- 不写客套的礼尚往来和千篇一律的反应。每个在场角色至少给出一个只有他才会有的反应或台词。
- 加入一个出人意料、但完全合乎人设的细节。

六、写深
- 放慢节奏：动作的细节、对话一来一回的交锋、各自心里的翻涌、身体感受和环境里的声音气味光线。

七、收尾
- 停在一个留给{{user}}接话或行动的地方，不替{{user}}说话、做决定。
- 本来要写的格式（状态、变量更新这些）照常写。`;

// v1.18.4：用户 2026-10-04 改的方向——不禁新人物新事件，只要服务眼下这场戏；对话是表现人物的主力
// v1.18.4 的第二版
const DEEPEN_V2 = `【本轮写法：深入这场戏】
接着上一条写，把眼下这段剧情写深、写活。

一、围着眼下这件事写
- 剧情还没聊完，就别急着收尾、跳时间或换到别处。
- 可以加新东西：路过的配角、突发的小事、一个有意思的物件或意外。但加的东西要服务这场戏——让此刻更有意思、更有张力，或者逼出人物更多的一面，不能把剧情带去另一条线。

二、对话是主角（重点）
- 人物性格主要靠说话演出来。多写台词，让对话一来一回地交锋。
- 每个人说话要有自己的味道：用词、句子长短、说话直不直接、口头禅、刻意回避的话题，盖住名字也能认出是谁在说。
- 话里有话：每个人这次开口都带着自己的目的；有些心思不会直说，要从措辞、试探、岔开话题、欲言又止里露出来。
- 动作、神态、语气、环境给对话加力：一个眼神、一个停顿、一个和嘴上说的不一样的小动作，让台词更有分量。

三、按人设的内核来
- 下笔前（心里想，不写出来）回看角色设定和世界书：这个人的身份、过往、性格内核、说话方式；此刻最想要什么、最怕什么、对在场的人真实怎么看。
- 行为从这些出发，不要只贴标签。精明的人要真精明：会察言观色、试探、留后手，不会为了配合{{user}}突然变笨或变软。
- 把性格的复杂写出来：嘴上和心里不一样，同时有矛盾的念头。不要用旁白下结论（不写「她很精明」，写出她精明的那句话）。

四、不写套路
- 不写客套的礼尚往来和谁都能说的场面话。每个在场角色至少有一句只有他才会说的话。
- 给一个出人意料、但完全合乎人设的反应或细节。

五、收尾
- 停在留给{{user}}接话或行动的地方，不替{{user}}说话、做决定。
- 本来要写的格式（状态栏、变量更新这些）照常写。`;

// v1.18.14 第三版（用户 2026-10-04 一起讨论定的）：短、通用，不针对哪个故事；不刻意加新东西。
// 起因：第二版让 AI「可以加新东西」，它加了一堆大动作，不顾上下文、把用户的人设带偏（用户：「太刻意了……跑别人上下文也不看了」）。
// v1.18.14 的第三版
const DEEPEN_V3 = `【深入这场戏】
不急着往前推，把眼下这一刻往深里写。
- 先想清楚这一刻：在场每个人想要什么、顾忌什么、藏着什么。{{user}}正在做的事和他的打算是前提，顺着写，别替他改主意。
- 让人物自己动起来：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软。
- 戏靠对话撑：你来我往、话里有话；动作、神态、环境给对话加分量。
- 节奏放慢，情绪一点点推；停在留给{{user}}接的地方。`;

// v1.18.18 试过的第四版（「戏靠对话撑」换成「让人物立起来」），用户：「深入现在挺好用……退回原版」。
// v1.18.19 起默认回到第三版；手机上存的是第四版原样就换回来。
const DEEPEN_V4 = `【深入这场戏】
不急着往前推，把眼下这一刻往深里写。
- 先想清楚这一刻：在场每个人想要什么、顾忌什么、藏着什么。{{user}}正在做的事和他的打算是前提，顺着写，别替他改主意。
- 让人物自己动起来：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软。
- 让人物立起来：用最能表现他此刻的东西——一句话、一个神情、一个动作、一种状态。
- 节奏放慢，情绪一点点推；停在留给{{user}}接的地方。`;

// v1.18.22 用户自己的版本（2026-10-04 他发来原文：「就按我给你发这个来吧」）。🚨 深入说明归用户，别再改。
export const DEFAULT_DEEPEN = `【深入这场戏】
不急着往前推，把眼下这一刻往深里写。
- 先想清楚这一刻：在场每个人想要什么、顾忌什么、藏着什么。{{user}}正在做的事和他的打算是前提，顺着写，别替他改主意。
- 让人物自己动起来：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软。
- 戏靠对话撑：你来我往、话里有话；动作、神态、环境给对话加分量。
- 想加点意思，就加一个合情合理的小变化，让这一刻多一层张力或趣味；不另起一条线，不把局面翻过来。
- 节奏放慢，情绪一点点推；停在留给{{user}}接的地方。`;

// v1.18.18 接管发送（用户 2026-10-04 一起讨论定的）：深入 = 原地往深挖；空着发送 = 往前走、要有转折；
// 写了字发送 = 照他写的走、写得好看（「同样是要去喝酒，李白写的就不一样」）。
// 换不换场景看这场戏的事办完没有（McKee：每场戏要有转折；Swain：场景—续场）。
const SEND_V1 = `【写好这一轮】
{{user}}刚写的是这一轮要发生的事，照着写，写得好看。
- 不改他的意思，他写的事发生到他写的程度为止。
- 在场的人按各自内核和此刻处境真实地回应，有自己的算盘。
- 让人物立起来：用最能表现他此刻的东西——一句话、一个神情、一个动作、一种状态；不写空话套话。
- 停在留给{{user}}接的地方。`;

const PUSH_V1 = `【往下走】
{{user}}这轮没写，交给你往下走一步。
- 先判断眼下这场戏的事办完没有。没办完：留在这场里，把它推到一个转折——有人做了决定、说破了话、关系或局面变了。办完了：写人物怎么消化刚才的事、各自打算怎么办，再自然过渡到下一场。
- 新东西从已有的人物、矛盾、伏笔里来，合乎人设和局面；{{user}}的打算是前提，别替他改主意。
- 让人物立起来：用最能表现他此刻的东西——一句话、一个神情、一个动作、一种状态。
- 这一轮要有东西变，不原地打转，不重复上一条；停在留给{{user}}接的地方。`;

// v1.18.25 发送两段换成通用范式（用户 2026-10-04 一起讨论定的）：教 AI 先想清楚再写——局势和后果、看点、人设最突出那面、
// 喜怒哀乐分明会变、以说出口的为主、人看得见、亲密照人设、结尾开放。起因：写出来扁平、没情绪、人设不突出、不看局势乱来。
// 用户：「写成个范式……任何故事可以用」「喜怒哀乐表现的不明确，就是一个木偶人」。手机上存的是 V1 原样才换。
export const DEFAULT_SEND = `【写好这一轮】
{{user}}刚写的是这一轮要发生的事，照他的意思写，到他写的程度为止。下笔前先想清楚（不写出来）：
- 局势：这个世界和眼下处境的规矩——谁说了算、谁在乎什么、谁在盯着谁。人做事说话都掂量后果：有风险的会怕、会犹豫、会找更稳的法子；对手也有脑子，反常的事会起疑。不写一拍脑袋就办、办了没后果的事。
- 看点：这件事对在场每个人意味着什么，会掀起什么波动。
- 人：人设是什么样就演成什么样，这一轮也不走样；人设里最突出的那一面（痴、忍、傲、媚、狠……）要在这一轮看得出来。每个人有自己的判断和打算，会想到现实的麻烦，不只是附和、表忠心。
- 情绪：喜怒哀乐要分明，是混的、会变的——又喜又酸、又信又疑、想要又不敢，被一句话推上去、又被一件事压下来；压着的情绪写出压抑和挣扎。心里和嘴上一不一样，看这个人的性子。对心上人、对仇人、对外人，是不同的样子。
- 走向：合情合理，但不走最顺手的路；找一个意外、回头一想又说得通的变化，或者留一个让人放不下的钩子。
写的时候：
- 以说出口的为主：话、语气、笑、哭、叹气、喘息、叫声，带着这个人的味道；不爱说、说不出口的，用心理描写补。
- 人要看得见：此刻的模样、衣着、神情、眼神、小动作，写得生动好看；情绪演出来，不贴「心头巨震」这种标签。
- 亲密的时候，媚态和反应也照人设来：什么样的人，就是什么样的状态。
- 环境背景点到为止，笔墨花在这件事怎么起伏上。
- 结尾开放：把人物眼下的难处、心思和几种可能摆出来，停在留给{{user}}拿主意、接话的地方。`;

export const DEFAULT_PUSH = `【往下走】
{{user}}这轮没写，交给你往下走一步。下笔前先想清楚（不写出来）：
- 这场戏办完没有：没办完，推到一个转折——有人做了决定、说破了话、露了底、关系或局面变了；办完了，写人物怎么消化刚才的事，再过渡到下一场。这一轮要有东西变，不原地打转，不重复上一条。{{user}}的打算是前提，别替他改主意。
- 局势：这个世界和眼下处境的规矩——谁说了算、谁在乎什么、谁在盯着谁。人做事说话都掂量后果：有风险的会怕、会犹豫、会找更稳的法子；对手也有脑子，反常的事会起疑。不写一拍脑袋就办、办了没后果的事。
- 看点：这件事对在场每个人意味着什么，会掀起什么波动。
- 人：人设是什么样就演成什么样，这一轮也不走样；人设里最突出的那一面（痴、忍、傲、媚、狠……）要在这一轮看得出来。每个人有自己的判断和打算，会想到现实的麻烦，不只是附和、表忠心。
- 情绪：喜怒哀乐要分明，是混的、会变的——又喜又酸、又信又疑、想要又不敢，被一句话推上去、又被一件事压下来；压着的情绪写出压抑和挣扎。心里和嘴上一不一样，看这个人的性子。对心上人、对仇人、对外人，是不同的样子。
- 走向：合情合理，但不走最顺手的路；找一个意外、回头一想又说得通的变化，或者留一个让人放不下的钩子。
写的时候：
- 以说出口的为主：话、语气、笑、哭、叹气、喘息、叫声，带着这个人的味道；不爱说、说不出口的，用心理描写补。
- 人要看得见：此刻的模样、衣着、神情、眼神、小动作，写得生动好看；情绪演出来，不贴「心头巨震」这种标签。
- 亲密的时候，媚态和反应也照人设来：什么样的人，就是什么样的状态。
- 环境背景点到为止，笔墨花在这件事怎么起伏上。
- 结尾开放：把人物眼下的难处、心思和几种可能摆出来，停在留给{{user}}拿主意、接话的地方。`;

// v1.18.30「活人版」四段（用户 2026-10-13 跟 Claude 一起讨论定的，他试过空着发送那段「效果最好」，另外三段照它的写法改）：
// 空着发送 = 往外发散为主、顺手写深；写了字发送 = 照他写的走、让他这一下激起新东西；深入 = 原地往深挖；
// 深入（写了字）= 照他写的走、停在他这一下上挖深。四段都加「不炒冷饭」：他反映 AI 老拿同一件糗事、同一句调情话翻来覆去说。
// 成人向言情和日常、没有打斗；该正经就正经、该露骨就露骨；情绪要满、会变；人还是这几个人，不切到别人的线。
const PUSH_LIVE = `【往下走】
{{user}}这轮没写，交给你往外拓一步：给这段戏带出点新东西，再顺手写深一点。

先想（不写出来）：
- 接下来能发生点什么新的？一个新念头、一件突然想做的事、一个冒出来的话题、一点小心机、一个暧昧的小意外、一个新玩法。从这几个人的人设、关系和眼前的现场里长出来，顺着上下文走，不凭空蹦出大事。
- 这件新事落到每个人身上，按各自的人设，会激起什么情绪？

写的时候：
- 往外走：这一轮要有新东西发生，局面、关系或气氛跟上一条比得变一点，不原地打转，不重复刚才的。
- 不炒冷饭：前几轮说过的梗、提过的旧事、用过的调情话，这一轮别再拿出来。同一件事非提不可，就得有新角度、新进展。新素材从此刻的现场找：她的身体、身边的东西、刚发生的小事、两人之间新冒出来的念头。
- 人还是这几个人：可以顺着戏一起去做件事、换个地方，但不跳切到别人的另一条线，不拉不相干的角色进来。
- 这是成人向的言情和日常：心动、暧昧、试探、吃醋、闹别扭、亲热，或者过日子的小事，没有打斗。气氛跟着戏走：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 人设是底线：新冒出来的念头、做的事、亲密时的样子，都得是这个人会有的。
- 情绪要满、会变：遇事就有反应，紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。被一句话点着，又被一件事浇灭，不是一条直线。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 顺手写深：新事里挑一个最打动人的瞬间多停一笔，其余快些带过。
- {{user}}的打算是前提，不替他说话、拿主意；停在他得接的地方。`;

const SEND_LIVE = `【写好这一轮】
{{user}}写的是这一轮的方向。照他的意思让它发生，再顺着它往外带一点：让他这一下激起新的东西，顺手写深一点。

先想（不写出来）：
- {{user}}这一下要的是什么劲儿？撩、哄、逼、试探、使坏，还是闹着玩？抓住这个劲儿。
- 这一下落到每个人身上，按各自的人设，会激起什么情绪、引出什么新反应？

写的时候：
- 照他写的走：不改他的意思，不替他多说话、多做决定；他写的要写饱满，话说得更有味道，动作写出画面。
- 这一下要有回响：在场的人接得住、反应得出来，局面、关系或气氛因为他这一下变了一点。她的反应可以带出一个新念头、新话头，但不另起他没写的大事。
- 不炒冷饭：前几轮说过的梗、提过的旧事、用过的调情话，这一轮别再拿出来。同一件事非提不可，就得有新角度、新进展。新素材从此刻的现场找：她的身体、身边的东西、刚发生的小事、两人之间新冒出来的念头。
- 人还是这几个人：不跳切到别人的另一条线，不拉不相干的角色进来。
- 这是成人向的言情和日常：心动、暧昧、试探、吃醋、闹别扭、亲热，或者过日子的小事，没有打斗。气氛跟着戏走：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 人设是底线：别人怎么接，都得是这个人会有的样子。不为了配合他一味顺从，会躲、会顶回来、会反撩。
- 情绪要满、会变：遇事就有反应，紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。被一句话点着，又被一件事浇灭，不是一条直线。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 顺手写深：他这一下里挑一个最打动人的瞬间多停一笔。
- 停在他得接的地方。`;

const DEEPEN_LIVE = `【深入这场戏】
{{user}}这轮没写，交给你把眼下这一刻往深里写，不急着往前推。

先想（不写出来）：
- 这一刻每个人想要什么、顾忌什么、藏着什么？{{user}}正在做的事和他的打算是前提，顺着写，别替他改主意。
- 这一刻还有哪一层没写到？一个没说破的心思、身体的一个反应、一句话底下的意思。

写的时候：
- 往深挖：笔墨停在这一刻，把它写透。想加点意思，就加一个合情合理的小变化，让这一刻多一层张力或趣味；不另起一条线，不把局面翻过来。
- 不炒冷饭：往深挖是挖出新东西，不是把前面说过的梗、旧事、调情话再说一遍。
- 人设是底线：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软。
- 戏靠对话撑：你来我往、话里有话；动作、神态、环境给对话加分量。
- 这是成人向的言情和日常：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 情绪要满、会变：紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 节奏放慢，情绪一点点推；停在留给{{user}}接的地方。`;

const DEEPEN_TEXT_LIVE = `【深入这场戏】
{{user}}这轮写了一段。照他的意思让它发生，然后不急着往前推，就在他这一下上往深里写。

先想（不写出来）：
- 他这一下要的是什么劲儿？落到每个人身上，激起了什么情绪、碰到了哪个心思？
- 这一下里还有哪一层没写到？一个没说破的心思、身体的一个反应、一句话底下的意思。

写的时候：
- 照他写的走：不改他的意思，不替他多说话、多做决定。
- 往深挖：笔墨停在他这一下激起的反应上，把它写透。想加点意思，就加一个合情合理的小变化；不另起一条线，不把局面翻过来。
- 不炒冷饭：往深挖是挖出新东西，不是把前面说过的梗、旧事、调情话再说一遍。
- 人设是底线：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软，会躲、会顶回来、会反撩。
- 戏靠对话撑：你来我往、话里有话；动作、神态、环境给对话加分量。
- 这是成人向的言情和日常：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 情绪要满、会变：紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 节奏放慢，情绪一点点推；停在留给{{user}}接的地方。`;

const LIVE_NAME = '活人版';

// v1.18.31「活人版 2」（用户 2026-10-13：「直接添加……又不是说把以前删掉」，活人版留着能点回去）：
// 按一把尺子分边界，从最收到最放：深入·写了字 < 深入 < 写了字发送 < 空着发送。
//   深入：剧情、地点不换，不跳时间，不加新人、不来突发；最多同一处挪一小步（换个房间），保住故事连贯（用户：「深入不换地方……切换太大……故事的连贯性就不存在了」）。
//   写了字发送：照他写的走，再顺着他这一下往外带（没料到的反应、因此引出的突发小事、跟眼下有关的人插进来）；不跳时间。
//   空着发送：可以推到转折、换地方、跳时间、来突发、跟故事有关的人加入，但得接得上前面的戏。以他「效果最好」的活人版空着发送为底子。
// 少炒冷饭只管讲的事和聊的内容；人物自己的习惯（口头禅、笑、语气、亲热时的声音、撩人的惯用招）是人设，照常有（用户：「这属于人物特性……边界分清」）。
// 不举例子凑清单：用户：「你就又做定式了……给他写个范式就行了，让他自己想」。
// 用户：「炒冷饭没必要写那么详细……简洁明了……它本来就慢，你再写的太多」，所以只留一句
const NO_REHASH = '- 少炒冷饭：讲过的事、聊过的话别翻来覆去说，再提就换个说法（口头禅、语气这类人物习惯不算）。';

const PUSH_LIVE2 = `【往下走】
{{user}}这轮没写，交给你往外拓一步：给这段戏带出点新东西，再顺手写深一点。

先想（不写出来）：
- 接下来能发生点什么新的？一个新念头、一件突然想做的事、一个冒出来的话题、一点小心机、一个暧昧的小意外、一个新玩法。从这几个人的人设、关系和刚才的事里长出来，顺着上下文走，不凭空蹦出大事。
- 这件新事落到每个人身上，按各自的人设，会激起什么情绪？

写的时候：
- 往外走：这一轮要有新东西发生，局面、关系或气氛跟上一条比得变一点，不原地打转，不重复刚才的。可以走得远一点：推到转折、换个地方、跳过一段时间、来个突发情况、让跟这个故事有关的人加入。不管多意外，都得接得上前面的戏，回头一想说得通；不跳去拍别人的另一条线。
${NO_REHASH}
- 这是成人向的言情和日常：心动、暧昧、试探、吃醋、闹别扭、亲热，或者过日子的小事，没有打斗。气氛跟着戏走：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 人设是底线：新冒出来的念头、做的事、亲密时的样子，都得是这个人会有的。
- 情绪要满、会变：遇事就有反应，紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。被一句话点着，又被一件事浇灭，不是一条直线。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 顺手写深：新事里挑一个最打动人的瞬间多停一笔，其余快些带过。
- {{user}}的打算是前提，不替他说话、拿主意；停在他得接的地方。`;

const SEND_LIVE2 = `【写好这一轮】
{{user}}写的是这一轮的方向。照他的意思让它发生，再顺着它往外带一点：让他这一下激起新的东西，顺手写深一点。

先想（不写出来）：
- {{user}}这一下要的是什么劲儿？撩、哄、逼、试探、使坏，还是闹着玩？抓住这个劲儿。
- 这一下落到每个人身上，按各自的人设，会激起什么情绪、引出什么新反应？

写的时候：
- 照他写的走：不改他的意思，不替他多说话、多做决定；他写的要写饱满，话说得更有味道，动作写出画面。
- 往外带一点：他这一下要有回响，在场的人接得住、反应得出来，局面、关系或气氛因此变一点。可以顺着他这一下引出他没料到的反应、一件突发的小事、一个跟眼下有关的人插进来。地点跟着他写的走，不跳时间，不另起跟他这一下无关的事。
${NO_REHASH}
- 这是成人向的言情和日常：心动、暧昧、试探、吃醋、闹别扭、亲热，或者过日子的小事，没有打斗。气氛跟着戏走：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 人设是底线：别人怎么接，都得是这个人会有的样子。不为了配合他一味顺从，会躲、会顶回来、会反撩。
- 情绪要满、会变：遇事就有反应，紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。被一句话点着，又被一件事浇灭，不是一条直线。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 顺手写深：他这一下里挑一个最打动人的瞬间多停一笔。
- 停在他得接的地方。`;

const DEEPEN_LIVE2 = `【深入这场戏】
{{user}}这轮没写，交给你把眼下这一刻往深里写，不急着往前推。

先想（不写出来）：
- 这一刻每个人想要什么、顾忌什么、藏着什么？{{user}}正在做的事和他的打算是前提，顺着写，别替他改主意。
- 这一刻还有哪一层没写到？

写的时候：
- 守住这场戏：剧情不换，地点不换，不跳时间，不加新人，不来突发事件。最多在同一处挪一小步（比如换个房间），故事得是连着的。
- 往深挖：笔墨停在这一刻，把它写透。想加点意思，就加一个合情合理的小变化，让这一刻多一层张力或趣味，不把局面翻过来。
${NO_REHASH}
- 人设是底线：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软。
- 戏靠对话撑：你来我往、话里有话；动作、神态、环境给对话加分量。
- 这是成人向的言情和日常：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 情绪要满、会变：紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 节奏放慢，情绪一点点推；停在留给{{user}}接的地方。`;

const DEEPEN_TEXT_LIVE2 = `【深入这场戏】
{{user}}这轮写了一段。照他的意思让它发生，然后不急着往前推，就在他这一下上往深里写。

先想（不写出来）：
- 他这一下要的是什么劲儿？落到每个人身上，激起了什么情绪、碰到了哪个心思？
- 这一下里还有哪一层没写到？

写的时候：
- 照他写的走：不改他的意思，不替他多说话、多做决定。
- 守住这场戏：剧情不换，地点不换，不跳时间，不加新人，不来突发事件。他自己写了挪地方才挪；故事得是连着的。
- 往深挖：笔墨停在他这一下激起的反应上，把它写透。想加点意思，就加一个合情合理的小变化，不把局面翻过来。
${NO_REHASH}
- 人设是底线：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软，会躲、会顶回来、会反撩。
- 戏靠对话撑：你来我往、话里有话；动作、神态、环境给对话加分量。
- 这是成人向的言情和日常：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 情绪要满、会变：紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 节奏放慢，情绪一点点推；停在留给{{user}}接的地方。`;

const LIVE2_NAME = '活人版 2';

// v1.18.37「活人版 3」（用户 2026-10-20 定：在活人版 2 上只改三处，其余原封不动保留）：
// 1. 删掉「没有打斗」；
// 2. 删掉催 AI 多说话的句子（深入两段去掉「戏靠对话撑：你来我往、话里有话；动作、神态、环境给对话加分量」，写了字发送去掉「话说得更有味道」）；
// 3. 松开 {{user}} 必须在场的死限制：{{user}} 在不在场跟剧情走，不在场就写好在场角色自己的戏。
const PUSH_LIVE3 = `【往下走】
{{user}}这轮没写，交给你往外拓一步：给这段戏带出点新东西，再顺手写深一点。

先想（不写出来）：
- 接下来能发生点什么新的？一个新念头、一件突然想做的事、一个冒出来的话题、一点小心机、一个暧昧的小意外、一个新玩法。从这几个人的人设、关系和刚才的事里长出来，顺着上下文走，不凭空蹦出大事。
- 这件新事落到每个人身上，按各自的人设，会激起什么情绪？

写的时候：
- 往外走：这一轮要有新东西发生，局面、关系或气氛跟上一条比得变一点，不原地打转，不重复刚才的。可以走得远一点：推到转折、换个地方、跳过一段时间、来个突发情况、让跟这个故事有关的人加入。不管多意外，都得接得上前面的戏，回头一想说得通；不跳去跟当前故事无关的线。
${NO_REHASH}
- 这是成人向的言情和日常：心动、暧昧、试探、吃醋、闹别扭、亲热，或者过日子的小事。气氛跟着戏走：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 人设是底线：新冒出来的念头、做的事、亲密时的样子，都得是这个人会有的。
- 情绪要满、会变：遇事就有反应，紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。被一句话点着，又被一件事浇灭，不是一条直线。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 顺手写深：新事里挑一个最打动人的瞬间多停一笔，其余快些带过。
- {{user}}在不在场跟剧情走：在场时他的打算是前提，不替他说话、拿主意，停在他得接的地方；不在场就写好在场角色自己的戏，停在自然告一段落的地方。`;

const SEND_LIVE3 = `【写好这一轮】
{{user}}写的是这一轮的方向。照他的意思让它发生，再顺着它往外带一点：让他这一下激起新的东西，顺手写深一点。

先想（不写出来）：
- {{user}}这一下要的是什么劲儿？撩、哄、逼、试探、使坏，还是闹着玩？抓住这个劲儿。
- 这一下落到每个人身上，按各自的人设，会激起什么情绪、引出什么新反应？

写的时候：
- 照他写的走：不改他的意思，不替他多说话、多做决定；他写的要写饱满，动作写出画面。
- 往外带一点：他这一下要有回响，在场的人接得住、反应得出来，局面、关系或气氛因此变一点。可以顺着他这一下引出他没料到的反应、一件突发的小事、一个跟眼下有关的人插进来。地点跟着他写的走，不跳时间，不另起跟他这一下无关的事。
${NO_REHASH}
- 这是成人向的言情和日常：心动、暧昧、试探、吃醋、闹别扭、亲热，或者过日子的小事。气氛跟着戏走：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 人设是底线：别人怎么接，都得是这个人会有的样子。不为了配合他一味顺从，会躲、会顶回来、会反撩。
- 情绪要满、会变：遇事就有反应，紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。被一句话点着，又被一件事浇灭，不是一条直线。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 顺手写深：他这一下里挑一个最打动人的瞬间多停一笔。
- {{user}}在不在场跟剧情走：在场就停在他得接的地方；不在场就写好在场角色自己的戏，停在自然告一段落的地方。`;

const DEEPEN_LIVE3 = `【深入这场戏】
{{user}}这轮没写，交给你把眼下这一刻往深里写，不急着往前推。

先想（不写出来）：
- 这一刻每个人想要什么、顾忌什么、藏着什么？{{user}}在不在场跟剧情走：在场时他正在做的事和打算是前提，顺着写，别替他改主意；不在场就按在场角色自己的处境想。
- 这一刻还有哪一层没写到？

写的时候：
- 守住这场戏：剧情不换，地点不换，不跳时间，不加新人，不来突发事件。最多在同一处挪一小步（比如换个房间），故事得是连着的。
- 往深挖：笔墨停在这一刻，把它写透。想加点意思，就加一个合情合理的小变化，让这一刻多一层张力或趣味，不把局面翻过来。
${NO_REHASH}
- 人设是底线：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软。
- 这是成人向的言情和日常：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 情绪要满、会变：紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 节奏放慢，情绪一点点推；{{user}}在场就停在留给他接的地方，不在场就写好在场角色自己的戏、停在自然告一段落的地方。`;

const DEEPEN_TEXT_LIVE3 = `【深入这场戏】
{{user}}这轮写了一段。照他的意思让它发生，然后不急着往前推，就在他这一下上往深里写。

先想（不写出来）：
- 他这一下要的是什么劲儿？落到每个人身上，激起了什么情绪、碰到了哪个心思？
- 这一下里还有哪一层没写到？

写的时候：
- 照他写的走：不改他的意思，不替他多说话、多做决定。
- 守住这场戏：剧情不换，地点不换，不跳时间，不加新人，不来突发事件。他自己写了挪地方才挪；故事得是连着的。
- 往深挖：笔墨停在他这一下激起的反应上，把它写透。想加点意思，就加一个合情合理的小变化，不把局面翻过来。
${NO_REHASH}
- 人设是底线：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软，会躲、会顶回来、会反撩。
- 这是成人向的言情和日常：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 情绪要满、会变：紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 节奏放慢，情绪一点点推；{{user}}在不在场跟剧情走：在场就停在留给他接的地方，不在场就写好在场角色自己的戏、停在自然告一段落的地方。`;

const LIVE3_NAME = '活人版 3';

// v1.18.38「活人版 V5」（用户 2026-10-20 定：在 V3 基础上削弱对话但保留交锋和动作神态环境的骨头架子）：
const PUSH_LIVE5 = PUSH_LIVE3;

const SEND_LIVE5 = `【写好这一轮】
{{user}}写的是这一轮的方向。照他的意思让它发生，再顺着它往外带一点：让他这一下激起新的东西，顺手写深一点。

先想（不写出来）：
- {{user}}这一下要的是什么劲儿？撩、哄、逼、试探、使坏，还是闹着玩？抓住这个劲儿。
- 这一下落到每个人身上，按各自的人设，会激起什么情绪、引出什么新反应？

写的时候：
- 照他写的走：不改他的意思，不替他多说话、多做决定；他写的要写饱满，开口要有味道，动作写出画面。
- 往外带一点：他这一下要有回响，在场的人接得住、反应得出来，局面、关系或气氛因此变一点。可以顺着他这一下引出他没料到的反应、一件突发的小事、一个跟眼下有关的人插进来。地点跟着他写的走，不跳时间，不另起跟他这一下无关的事。
${NO_REHASH}
- 这是成人向的言情和日常：心动、暧昧、试探、吃醋、闹别扭、亲热，或者过日子的小事。气氛跟着戏走：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 人设是底线：别人怎么接，都得是这个人会有的样子。不为了配合他一味顺从，会躲、会顶回来、会反撩。
- 情绪要满、会变：遇事就有反应，紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。被一句话点着，又被一件事浇灭，不是一条直线。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 顺手写深：他这一下里挑一个最打动人的瞬间多停一笔。
- {{user}}在不在场跟剧情走：在场就停在他得接的地方；不在场就写好在场角色自己的戏，停在自然告一段落的地方。`;

const DEEPEN_LIVE5 = `【深入这场戏】
{{user}}这轮没写，交给你把眼下这一刻往深里写，不急着往前推。

先想（不写出来）：
- 这一刻每个人想要什么、顾忌什么、藏着什么？{{user}}在不在场跟剧情走：在场时他正在做的事和打算是前提，顺着写，别替他改主意；不在场就按在场角色自己的处境想。
- 这一刻还有哪一层没写到？

写的时候：
- 守住这场戏：剧情不换，地点不换，不跳时间，不加新人，不来突发事件。最多在同一处挪一小步（比如换个房间），故事得是连着的。
- 往深挖：笔墨停在这一刻，把它写透。想加点意思，就加一个合情合理的小变化，让这一刻多一层张力或趣味，不把局面翻过来。
${NO_REHASH}
- 人设是底线：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软。
- 留住交锋的架子：开口时你来我往、话里有话；动作、神态、环境一起给这一刻加分量。
- 这是成人向的言情和日常：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 情绪要满、会变：紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 节奏放慢，情绪一点点推；{{user}}在场就停在留给他接的地方，不在场就写好在场角色自己的戏、停在自然告一段落的地方。`;

const DEEPEN_TEXT_LIVE5 = `【深入这场戏】
{{user}}这轮写了一段。照他的意思让它发生，然后不急着往前推，就在他这一下上往深里写。

先想（不写出来）：
- 他这一下要的是什么劲儿？落到每个人身上，激起了什么情绪、碰到了哪个心思？
- 这一下里还有哪一层没写到？

写的时候：
- 照他写的走：不改他的意思，不替他多说话、多做决定。
- 守住这场戏：剧情不换，地点不换，不跳时间，不加新人，不来突发事件。他自己写了挪地方才挪；故事得是连着的。
- 往深挖：笔墨停在他这一下激起的反应上，把它写透。想加点意思，就加一个合情合理的小变化，不把局面翻过来。
${NO_REHASH}
- 人设是底线：按各自的性格内核和此刻处境去反应，有自己的算盘，不为配合谁变笨变软，会躲、会顶回来、会反撩。
- 留住交锋的架子：开口时你来我往、话里有话；动作、神态、环境一起给这一刻加分量。
- 这是成人向的言情和日常：该正经就正经，该撩就撩，该露骨就露骨，不刻意端着。
- 情绪要满、会变：紧张、慌乱、狂喜、嫉妒、委屈、羞恼、失控、癫狂都可能。性子冷、能忍的也会有裂缝：手抖、声音变了、话突然少了。脸色、眼神、呼吸、声音、手上的动作、身体的反应，都写得让人看得见。
- 节奏放慢，情绪一点点推；{{user}}在不在场跟剧情走：在场就停在留给他接的地方，不在场就写好在场角色自己的戏、停在自然告一段落的地方。`;

const LIVE5_NAME = '活人版 V5';
const LIVE_LATEST = 'live5';

// ≡「写法说明」里能改的四段（v1.18.30 加了「深入（写了字）」）
// 存档里「自带的」（v1.18.23 加；v1.18.24 不编号，名字概括内容）：defName 原版的名字，olds 以前的版本
const PROMPTS = [
    { key: 'deepenPrompt', name: '深入', desc: '点「深入」时用：原地往深挖，另起一条', def: () => DEFAULT_DEEPEN,
        defName: '戏靠对话撑，加个小变化',
        olds: () => [
            { bid: 'v4', name: '让人物立起来', text: DEEPEN_V4 },
            { bid: 'v3', name: '戏靠对话撑（短）', text: DEEPEN_V3 },
            { bid: 'v2', name: '能加配角小事，对话为主', text: DEEPEN_V2 },
            { bid: 'v1', name: '锁住场景，七条细写', text: DEEPEN_V1 },
        ],
        lives: () => [{ bid: 'live', name: LIVE_NAME, text: DEEPEN_LIVE }, { bid: 'live2', name: LIVE2_NAME, text: DEEPEN_LIVE2 }, { bid: 'live3', name: LIVE3_NAME, text: DEEPEN_LIVE3 }, { bid: 'live5', name: LIVE5_NAME, text: DEEPEN_LIVE5 }] },
    { key: 'deepenTextPrompt', name: '深入（写了字）', desc: '输入框有字再点「深入」时用：照你写的走，在你这一下上往深里写', def: () => DEEPEN_TEXT_LIVE,
        defBid: 'live', defName: LIVE_NAME,
        lives: () => [{ bid: 'live2', name: LIVE2_NAME, text: DEEPEN_TEXT_LIVE2 }, { bid: 'live3', name: LIVE3_NAME, text: DEEPEN_TEXT_LIVE3 }, { bid: 'live5', name: LIVE5_NAME, text: DEEPEN_TEXT_LIVE5 }] },
    { key: 'sendPrompt', name: '写了字发送', desc: '输入框有字点发送时用：照你写的走，写出戏来', def: () => DEFAULT_SEND,
        defBid: 'v2', defName: '范式：看局势、立人设、情绪分明、结尾开放',
        olds: () => [{ bid: 'def', name: '照你写的走，写得好看（短）', text: SEND_V1 }],
        lives: () => [{ bid: 'live', name: LIVE_NAME, text: SEND_LIVE }, { bid: 'live2', name: LIVE2_NAME, text: SEND_LIVE2 }, { bid: 'live3', name: LIVE3_NAME, text: SEND_LIVE3 }, { bid: 'live5', name: LIVE5_NAME, text: SEND_LIVE5 }] },
    { key: 'pushPrompt', name: '空着发送', desc: '输入框空着点发送时用：另起一条，往下走一步', def: () => DEFAULT_PUSH,
        defBid: 'v2', defName: '范式：推到转折，看局势、立人设、结尾开放',
        olds: () => [{ bid: 'def', name: '往下走一步，要有转折（短）', text: PUSH_V1 }],
        lives: () => [{ bid: 'live', name: LIVE_NAME, text: PUSH_LIVE }, { bid: 'live2', name: LIVE2_NAME, text: PUSH_LIVE2 }, { bid: 'live3', name: LIVE3_NAME, text: PUSH_LIVE3 }, { bid: 'live5', name: LIVE5_NAME, text: PUSH_LIVE5 }] },
];

let mountTimer = null;
let observer = null;
let resizeObs = null;
let barTimer = null;
let barRuns = [];
let barPausedUntil = 0;
let posFrame = null;
let deepenArmed = false;
let deepenTimer = null;
let genListeners = [];
let bound = false;

function settings() {
    const all = ctx()?.extensionSettings;
    if (!all) return { varsInMenu: true, deepenButton: true, sendTakeover: true, deepenPrompt: DEEPEN_LIVE5, deepenTextPrompt: DEEPEN_TEXT_LIVE5, sendPrompt: SEND_LIVE5, pushPrompt: PUSH_LIVE5 };
    const s = all[EXTENSION_KEY] = all[EXTENSION_KEY] || {};
    if (typeof s.varsInMenu !== 'boolean') s.varsInMenu = true;
    if (typeof s.deepenButton !== 'boolean') s.deepenButton = true;
    if (typeof s.hideAgentButton !== 'boolean') s.hideAgentButton = true;
    // 旧默认原样才自动换；自己在「写法说明」里保存过（deepenPromptOwn，比如从存档换回第三版）就不动
    if (typeof s.deepenPrompt !== 'string' || !s.deepenPrompt.trim() || (!s.deepenPromptOwn && [DEEPEN_V1, DEEPEN_V2, DEEPEN_V3, DEEPEN_V4].includes(s.deepenPrompt))) s.deepenPrompt = DEFAULT_DEEPEN;
    if (typeof s.sendTakeover !== 'boolean') s.sendTakeover = true;
    // 旧默认原样才换新版；自己改过的不动
    if (typeof s.sendPrompt !== 'string' || !s.sendPrompt.trim() || s.sendPrompt === SEND_V1) s.sendPrompt = DEFAULT_SEND;
    if (typeof s.pushPrompt !== 'string' || !s.pushPrompt.trim() || s.pushPrompt === PUSH_V1) s.pushPrompt = DEFAULT_PUSH;
    if (typeof s.deepenTextPrompt !== 'string' || !s.deepenTextPrompt.trim()) s.deepenTextPrompt = DEEPEN_TEXT_LIVE;
    if (!s.promptArchive || typeof s.promptArchive !== 'object') s.promptArchive = {};
    // 四段换上最新一版自带的（v1.18.30 活人版、v1.18.31 活人版 2），每版只换一次（用户：「直接给我写到程序里边」「直接添加……又不是说把以前删掉」）；
    // 换下来的那条不在存档里就补一条「自动存的」，想回去在列表里点它。以后再加新版：lives 末尾加一条、LIVE_LATEST 改成它的 bid
    if (s.liveSwitched !== LIVE_LATEST) {
        for (const p of PROMPTS) {
            const live = p.lives?.().at(-1)?.text ?? p.def();
            const old = s[p.key];
            const list = s.promptArchive[p.key] = Array.isArray(s.promptArchive[p.key]) ? s.promptArchive[p.key] : [];
            if (typeof old === 'string' && old.trim() && old.trim() !== live.trim() && !list.some((x) => String(x.text).trim() === old.trim())) {
                list.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: '', named: false, text: old, at: Date.now(), auto: true });
            }
            s[p.key] = live;
        }
        s.deepenPromptOwn = true;
        s.liveSwitched = LIVE_LATEST;
    }
    delete s.bottomButton;
    return s;
}
const save = () => ctx()?.saveSettingsDebounced?.();

// ---------------------------------------------------------------- 变量按钮：藏掉那排，≡ 里点开用

function varButtons() {
    return [...document.querySelectorAll('#send_form .qr--button')].filter((el) => VAR_BUTTONS.includes((el.textContent || '').trim()));
}

function applyBar() {
    const on = settings().varsInMenu;
    document.querySelectorAll(`.${HIDE_CLASS}`).forEach((el) => { if (!on) el.classList.remove(HIDE_CLASS); });
    if (on) {
        for (const button of varButtons()) {
            const group = button.closest('.qr--buttons');
            // 一组里只有这两个就整组藏（连间距一起），混着别的按钮就只藏这两个
            const onlyVars = group && [...group.querySelectorAll('.qr--button')].every((b) => VAR_BUTTONS.includes((b.textContent || '').trim()));
            const target = onlyVars ? group : button;
            if (!target.classList.contains(HIDE_CLASS)) target.classList.add(HIDE_CLASS);
        }
    }
    // 整排都藏光了就把这排也收起来，不留一条空白
    for (const bar of document.querySelectorAll('#send_form #qr--bar')) {
        const visible = [...bar.querySelectorAll('.qr--button')].some((b) => !b.closest(`.${HIDE_CLASS}`));
        const empty = on && !visible;
        if (bar.classList.contains(EMPTY_BAR) !== empty) bar.classList.toggle(EMPTY_BAR, empty);
    }
    schedulePosition();
}

// 刹车：攒 80 毫秒做一次；3 秒里做了 30 次以上就歇 10 秒（只改 class，正常不会来回抢）
function scheduleBar() {
    if (barTimer) return;
    const wait = Math.max(80, barPausedUntil - Date.now());
    barTimer = setTimeout(() => {
        barTimer = null;
        const now = Date.now();
        barRuns = barRuns.filter((at) => now - at < 3000);
        barRuns.push(now);
        if (barRuns.length > 30) { barPausedUntil = now + 10000; barRuns = []; return; }
        applyBar();
    }, wait);
}

function closeOptionsMenu() {
    const menu = document.getElementById('options');
    if (menu && getComputedStyle(menu).display !== 'none') document.getElementById('options_button')?.click();
}

async function openVarsPopup() {
    const context = ctx();
    const box = document.createElement('div');
    box.className = 'tt-vars-pop';
    const found = varButtons();
    box.innerHTML = `<h3 class="tt-tip-row">变量 ${tip('这两个按钮是角色卡自带的（MVU 变量）。重新处理变量：把最后一条回复的变量重新算一遍，数值没变时点。重新读取初始变量：角色卡改了初始数值、或者开局变量坏了才用。')}</h3>`
        + (found.length
            ? VAR_BUTTONS.map((name) => `<button type="button" class="menu_button tt-vars-act" data-name="${name}">${name}</button>`).join('')
            : '<small>这张角色卡没有变量按钮。</small>');
    let popup = null;
    box.addEventListener('click', (event) => {
        const act = event.target.closest('.tt-vars-act');
        if (!act) return;
        const target = varButtons().find((b) => (b.textContent || '').trim() === act.dataset.name);
        if (!target) { globalThis.toastr?.info?.('找不到这个按钮了', '变量'); return; }
        vlog('变量按钮', `从 ≡ 菜单点了「${act.dataset.name}」`);
        target.click();
        popup?.completeAffirmative?.() ?? document.querySelector('.popup:last-of-type .popup-button-ok')?.click();
    });
    if (!context?.callGenericPopup) return;
    if (context.Popup && context.POPUP_TYPE) {
        popup = new context.Popup(box, context.POPUP_TYPE.TEXT, '', { okButton: '关闭' });
        await popup.show();
    } else {
        await context.callGenericPopup(box, context.POPUP_TYPE.TEXT, '', { okButton: '关闭' });
    }
}

function mountMenuItem() {
    const list = document.querySelector('#options .options-content');
    if (!list) return false;
    if (!document.getElementById(BOTTOM_MENU_ID)) {
        const down = document.createElement('a');
        down.id = BOTTOM_MENU_ID;
        down.title = '跳到聊天最底下';
        down.innerHTML = '<i class="fa-lg fa-solid fa-angles-down"></i><span>到最底下</span>';
        down.addEventListener('click', (event) => {
            event.preventDefault();
            closeOptionsMenu();
            jumpBottom();
        });
        list.append(down);
    }
    if (!document.getElementById(PROMPTS_MENU_ID)) {
        const item = document.createElement('a');
        item.id = PROMPTS_MENU_ID;
        item.title = '改深入、写了字发送、空着发送时临时加给 AI 的说明';
        item.innerHTML = '<i class="fa-lg fa-solid fa-feather-pointed"></i><span>写法说明</span>';
        item.addEventListener('click', (event) => {
            event.preventDefault();
            closeOptionsMenu();
            openPromptPicker();
        });
        list.append(item);
    }
    const existing = document.getElementById(MENU_ID);
    if (!settings().varsInMenu) { existing?.remove(); return true; }
    if (existing) return true;
    const item = document.createElement('a');
    item.id = MENU_ID;
    item.title = '重新处理变量、重新读取初始变量';
    item.innerHTML = '<i class="fa-lg fa-solid fa-sliders"></i><span>变量</span>';
    item.addEventListener('click', (event) => {
        event.preventDefault();
        closeOptionsMenu();
        openVarsPopup();
    });
    list.append(item);
    return true;
}

// ---------------------------------------------------------------- 发送按钮上面的小圆图标：深入、到底

function chat() { return document.getElementById('chat'); }
function generating() {
    const stop = document.getElementById('mes_stop');
    return !!stop && getComputedStyle(stop).display !== 'none';
}

// 快捷工具这一排（v1.18.6）：输入框上面单独一排，跟发送按钮一个颜色的小按钮，现在只有「深入」，
// 以后加的快捷工具都往这排放（写进 QUICK_TOOLS）。用户 2026-10-04：「第二排就是以后咱们加的快捷工具」。
// 这排是本扩展自己的元素，放在输入框那块（#nonQRFormItems）前面；不带 qr 的 class，酒馆助手不会管它。
const ROW_ID = 'tt-quick-tools';
const QUICK_TOOLS = [
    { id: DEEPEN_ID, label: '深入', icon: '', title: '深入：围着这场戏写深一条', on: () => settings().deepenButton, click: (e) => onDeepen(e) },
];

function ensureButtons() {
    const form = document.getElementById('send_form');
    if (!form) return;
    let row = document.getElementById(ROW_ID);
    if (!row) {
        row = document.createElement('div');
        row.id = ROW_ID;
        for (const tool of QUICK_TOOLS) {
            const b = document.createElement('button');
            b.type = 'button';
            b.id = tool.id;
            b.className = 'tt-quick-btn';
            b.title = tool.title;
            b.innerHTML = `${tool.icon ? `<i class="fa-solid ${tool.icon}"></i>` : ''}<span>${tool.label}</span>`;
            b.addEventListener('click', tool.click);
            row.append(b);
        }
    }
    // v1.18.16：放进输入框那一行右边那组按钮的最前面（发送 / Agent 左边），用户在截图里圈的位置
    const right = document.getElementById('rightSendForm');
    if (right) {
        if (right.firstElementChild !== row) right.insertBefore(row, right.firstElementChild);
    } else {
        const anchor = form.querySelector(':scope > #nonQRFormItems');
        if (anchor) { if (row.nextElementSibling !== anchor) form.insertBefore(row, anchor); }
        else if (row.parentElement !== form) form.append(row);
    }
}

// 藏 TauriTavern 的 Agent 按钮（发送左边那个原子图标）：用户「我一般不会用那个东西」。
// 只加 body class 用 CSS 藏；Agent 模式开着时（按钮有 active / running）不藏，免得关不掉
function applyAgentHide() {
    document.body?.classList.toggle('tt-hide-agent', !!settings().hideAgentButton);
}

function position() {
    posFrame = null;
    applyAgentHide();
    ensureButtons();
    const row = document.getElementById(ROW_ID);
    if (!row) return;
    let any = false;
    for (const tool of QUICK_TOOLS) {
        const b = document.getElementById(tool.id);
        const show = !!tool.on();
        if (b) b.hidden = !show;
        any ||= show;
    }
    row.hidden = !any;
    const busy = generating();
    row.classList.toggle('tt-quick-busy', busy);
}

function schedulePosition() {
    if (posFrame !== null) return;
    posFrame = setTimeout(position, 60);
}

function jumpBottom() {
    const c = chat();
    if (!c) return;
    c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    // 图片、状态栏晚到会把底部再往下推，过一会儿再补一下
    setTimeout(() => { c.scrollTop = c.scrollHeight; schedulePosition(); }, 700);
}

// ---------------------------------------------------------------- 深入：一次性加写法说明，出一条

function setDeepenPrompt(text) {
    const context = ctx();
    if (typeof context?.setExtensionPrompt !== 'function') return false;
    // 位置：聊天里、深度 0（紧挨最新消息），角色 system；用完就清
    context.setExtensionPrompt(PROMPT_KEY, text, 1, 0, false, 0);
    return true;
}

function disarmDeepen(reason) {
    if (!deepenArmed) return;
    deepenArmed = false;
    clearTimeout(deepenTimer);
    setDeepenPrompt('');
    vlog('深入', `写法说明撤掉了（${reason}）`);
    schedulePosition();
}

// v1.18.15 用户 2026-10-04：
// 1. 深入另起一条新回复，不接在上一条后面续写（「万一深入不好或者改偏，我还可以删掉……一长串的深入，有一条不行就得删一堆」）。
//    他的酒馆空着发送 = 接着上一条续写，所以不点发送按钮，直接叫酒馆生成一条新的（generate('normal')）。
// 2. 输入框里有字：当成这一轮深入的「临时补充」加在说明后面一起给 AI，不作为他的消息发出去，输入框清空
//    （「我给婉茹送了一个玉簪……把我这段话也给带上……做个临时补充」）。出错就把字放回去。
// v1.18.20：输入框有字时，字照常作为你的消息发出去（留在聊天里，写得不好能改了重发），
// 再带上深入说明另起一条回复。用户：「正文别被吃掉呀，我可以修改正文，然后再重新发一遍」。
// （v1.18.15～19 是把字当临时补充塞进说明、清空输入框不发，聊天里看不到）
let deepenSending = false;

async function onDeepen(event) {
    event.preventDefault();
    if (generating()) return;
    const context = ctx();
    const box = document.getElementById('send_textarea');
    const typed = (box?.value ?? '').trim();
    // v1.18.30 写了字用「深入（写了字）」那段，没写字用「深入」那段
    const st = settings();
    if (!setDeepenPrompt(typed ? (st.deepenTextPrompt || DEEPEN_TEXT_LIVE) : (st.deepenPrompt || DEFAULT_DEEPEN))) {
        globalThis.toastr?.warning?.('这个版本的酒馆不支持临时加说明', '深入');
        return;
    }
    deepenArmed = true;
    clearTimeout(deepenTimer);
    deepenTimer = setTimeout(() => disarmDeepen('5 分钟没出完'), 5 * 60 * 1000);
    vlog('深入', typed ? `点了深入，你写的字照常发出去：${typed.slice(0, 200)}` : '点了深入，另起一条新回复');
    try {
        if (typed) {
            // 点酒馆自己的发送：有字时它发你的消息 + 出新回复；接管发送这次让开，不换成「写好这一轮」
            const send = document.getElementById('send_but');
            if (!send) throw new Error('找不到发送按钮');
            deepenSending = true;
            try { send.click(); } finally { deepenSending = false; }
        } else if (typeof context?.generate === 'function') {
            await context.generate('normal');
        } else {
            // 老版本没有 generate：退回点发送（这时可能接着上一条续写）
            const send = document.getElementById('send_but');
            if (!send) throw new Error('找不到发送按钮');
            send.click();
        }
    } catch (error) {
        disarmDeepen('出错了');
        vlog('出错', `深入生成失败：${error?.message || error}`);
        globalThis.toastr?.error?.(String(error?.message || error), '深入');
    }
}

// ---------------------------------------------------------------- ≡「写法说明」：选一段 → 存档列表 → 改一条

// 按内容给存档起个名字（v1.18.24）：跟哪套自带的一样就叫那个名；在原版上改的叫「改：新加的那句开头」；
// 只删了几条叫「原版少 N 条」；全新写的取第一句开头。一句话截到第一个标点、最多 16 个字。
const cleanLine = (l) => l.trim().replace(/^[-·•*\d.、\s]+/, '').trim();
const isHeading = (l) => /^【[^】]*】$/.test(l);
function shortLine(line) {
    const m = line.match(/^(.{4,}?)[，。；：,;:！？!?（(]/);
    let t = m ? m[1] : line;
    if (t.length > 16) t = `${t.slice(0, 15)}…`;
    return t;
}
export function summarize(text, base, builtins = []) {
    const lines = String(text || '').split('\n').map(cleanLine).filter((l) => l && !isHeading(l));
    if (!lines.length) return '（空的）';
    const same = builtins.find((b) => b.text.trim() === String(text).trim());
    if (same) return same.name;
    const baseLines = String(base || '').split('\n').map(cleanLine).filter((l) => l && !isHeading(l));
    const baseSet = new Set(baseLines);
    const added = lines.filter((l) => !baseSet.has(l));
    if (!added.length) return `原版少 ${Math.max(1, baseLines.length - lines.length)} 条`;
    if (added.length < lines.length) return `改：${shortLine(added[0])}`;
    return shortLine(lines[0]);
}

// 写法说明的存档（v1.18.23）：settings().promptArchive[key] = [{ id, name, text, at, auto }]，旧的在前、新的在后
function archiveFor(p) {
    const st = settings();
    const all = st.promptArchive;
    const seeded = st.promptArchiveSeeded = st.promptArchiveSeeded && typeof st.promptArchiveSeeded === 'object' ? st.promptArchiveSeeded : {};
    const items = () => (all[p.key] = Array.isArray(all[p.key]) ? all[p.key] : []);
    const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // v1.18.30 起「活人版」这些（lives）也是自带的：已经放过的老用户，下次打开排到最底下
    const builtins = [{ bid: p.defBid || 'def', name: p.defName || '原版', text: p.def() }, ...(p.lives?.() || []), ...(p.olds?.() || [])];
    let dirty = false;
    // v1.18.23 存的条目名字是「存档 3」「换下来的 · 时间」这种，当成没起名，按内容概括
    for (const x of items()) if (typeof x.named !== 'boolean') { x.named = !/^(存档 \d+|存档 · .*|换下来的 · .*|新的一条)$/.test(x.name || ''); dirty = true; }
    // v1.18.24 自带的也放进同一列、能删：每套自带的只放进来一次（记在 promptArchiveSeeded），删了就不再回来；
    // 以后扩展新加的自带版本，下次打开排到最底下。
    const done = seeded[p.key] = Array.isArray(seeded[p.key]) ? seeded[p.key] : [];
    const fresh = builtins.filter((b) => !done.includes(b.bid));
    if (fresh.length) {
        const list = items();
        const firstTime = !done.length;
        const add = fresh.filter((b) => !list.some((x) => x.text.trim() === b.text.trim()))
            .map((b) => ({ id: newId(), name: b.name, named: true, builtin: true, text: b.text, at: Date.now() }));
        if (firstTime) list.unshift(...add); else list.push(...add);
        done.push(...fresh.map((b) => b.bid));
        dirty = true;
    }
    if (dirty) save();
    return {
        summarize: (text) => summarize(text, p.def(), builtins),
        // 在原版上改的：预览只给改动的那几句，一眼看出跟原版差在哪
        changed(text) {
            const base = new Set(String(p.def()).split('\n').map(cleanLine).filter(Boolean));
            const lines = String(text || '').split('\n').map(cleanLine).filter((l) => l && !isHeading(l));
            const added = lines.filter((l) => !base.has(l));
            return added.length && added.length < lines.length ? added : null;
        },
        list: () => items(),
        add({ text, auto = false }) {
            const item = { id: newId(), name: '', named: false, text, at: Date.now(), ...(auto ? { auto: true } : {}) };
            items().push(item);
            save();
            return item;
        },
        update(id, patch) {
            const item = items().find((x) => x.id === id);
            if (!item) return;
            Object.assign(item, patch, { at: Date.now() });
            delete item.auto;
            save();
        },
        remove(id) {
            const list = items();
            const i = list.findIndex((x) => x.id === id);
            if (i >= 0) { list.splice(i, 1); save(); }
        },
    };
}

// v1.18.29 改成三层翻页（text-editor.js 的 openPromptBook）：选哪段 → 存档列表 → 改一条。
// 列表里点一条就直接换上；正在用的永远在列表里（不在就补一条「自动存的」），所以不用再「保存时把换下来的旧版存一份」。
function useText(p, text) {
    const s = settings();
    s[p.key] = text.trim() ? text : p.def();
    if (p.key === 'deepenPrompt') s.deepenPromptOwn = true;
    save();
    vlog('写法说明', `「${p.name}」换上了另一条`);
}

function openPromptPicker() {
    openPromptBook({
        title: '写法说明',
        homeTip: '这三段是点按钮时临时加给 AI 的说明，只管那一条回复，出完就撤掉。点一段进去：看存过的几条、换着用、改字。',
        listTip: '绿框「✓ 正在用」就是现在用的。点一条直接换上；点「改」进去改字，改的是正在用的那条，保存就生效。名字按内容自动概括，想自己起就在「改」里填。什么都不会自动删，多了自己点「删」（正在用的那条不能删）。',
        sections: PROMPTS.map((p) => ({
            name: p.name,
            desc: p.desc,
            archive: archiveFor(p),
            current: () => settings()[p.key] || p.def(),
            use: (text) => useText(p, text),
        })),
    });
}

// ---------------------------------------------------------------- 接管发送（v1.18.18）
// 写了字：加「写好这一轮」再让酒馆照常发；空着：加「往下走」，自己另起一条新回复（不走酒馆的「按发送键以继续」）。

function armPrompt(text, label) {
    if (!setDeepenPrompt(text)) return false;
    deepenArmed = true;
    clearTimeout(deepenTimer);
    deepenTimer = setTimeout(() => disarmDeepen('5 分钟没出完'), 5 * 60 * 1000);
    vlog('写法说明', `这一条带上「${label}」`);
    return true;
}

async function onSendClick(event) {
    if (!event.target?.closest?.('#send_but')) return;
    if (deepenSending) return; // 深入替你点的发送：说明已经是深入的了
    if (!settings().sendTakeover || generating()) return;
    const box = document.getElementById('send_textarea');
    const typed = (box?.value ?? '').trim();
    if (typed) {
        armPrompt(settings().sendPrompt || DEFAULT_SEND, '写了字发送');
        return; // 让酒馆照常发
    }
    const context = ctx();
    if (typeof context?.generate !== 'function') { armPrompt(settings().pushPrompt || DEFAULT_PUSH, '空着发送'); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!armPrompt(settings().pushPrompt || DEFAULT_PUSH, '空着发送')) return;
    try {
        await context.generate('normal');
    } catch (error) {
        disarmDeepen('出错了');
        vlog('出错', `空着发送生成失败：${error?.message || error}`);
        globalThis.toastr?.error?.(String(error?.message || error), '发送');
    }
}

function bindGeneration() {
    const context = ctx();
    const types = context?.eventTypes ?? context?.event_types;
    const events = context?.eventSource;
    if (!events?.on || !types || genListeners.length) return;
    const on = (name, fn) => { if (types[name]) { events.on(types[name], fn); genListeners.push([types[name], fn]); } };
    on('GENERATION_ENDED', () => { disarmDeepen('出完了'); schedulePosition(); });
    on('GENERATION_STOPPED', () => { disarmDeepen('停了'); schedulePosition(); });
    on('GENERATION_STARTED', schedulePosition);
    on('CHAT_CHANGED', () => { disarmDeepen('换了聊天'); setTimeout(() => { applyBar(); schedulePosition(); }, 500); });
    on('MESSAGE_RECEIVED', schedulePosition);
}

// ---------------------------------------------------------------- 扩展页「聊天按钮」


function mountPanel() {
    if (document.getElementById(SETTINGS_ID)) return true;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;
    host.insertAdjacentHTML('beforeend', `
<div id="${SETTINGS_ID}">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>聊天按钮</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-ct-vars"> <span>变量按钮收进 ≡ 菜单</span></label>${tip('输入框上面「重新处理变量」「重新读取初始变量」那排大按钮藏起来，改从 ≡ 菜单的「变量」点开用。')}</div>
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-ct-deepen"> <span>深入按钮</span></label>${tip('输入框上面快捷工具那一排的「深入」。点了另起一条新回复，AI 围着眼下这场戏写深一条，把人物立起来。输入框里先写几句（比如「我送了她一支玉簪」），点深入就当成这一轮的补充一起带上，不会作为你的消息发出去。')}</div>
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-ct-agent"> <span>藏掉 Agent 按钮</span></label>${tip('发送按钮左边那个原子图标（TauriTavern 的 Agent 模式）。Agent 模式开着时按钮照常显示，方便关掉。')}</div>
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-ct-send"> <span>接管发送</span></label>${tip('写了字点发送：带上「写好这一轮」，照你写的走、写得好看。空着点发送：另起一条新回复，带上「往下走」，不再接着上一条续写。关掉就是酒馆原来的发送。')}</div>
      <div class="menu_button" id="tt-ct-prompts">改写法说明（深入 / 写了字发送 / 空着发送）</div>
    </div>
  </div>
</div>`);
    const s = settings();
    const bind = (id, key, after) => {
        const box = document.getElementById(id);
        box.checked = !!s[key];
        box.addEventListener('change', () => { settings()[key] = box.checked; save(); after(); });
    };
    bind('tt-ct-vars', 'varsInMenu', () => { applyBar(); mountMenuItem(); });
    bind('tt-ct-deepen', 'deepenButton', schedulePosition);
    bind('tt-ct-agent', 'hideAgentButton', applyAgentHide);
    bind('tt-ct-send', 'sendTakeover', () => {});
    document.getElementById('tt-ct-prompts').addEventListener('click', () => openPromptPicker());
    return true;
}

// ---------------------------------------------------------------- 挂上 / 卸下

function bindDom() {
    if (bound) return;
    bound = true;
    window.addEventListener('resize', schedulePosition);
    document.addEventListener('click', onSendClick, true);
    document.addEventListener('focusin', schedulePosition, true);
    document.addEventListener('focusout', schedulePosition, true);
    chat()?.addEventListener('scroll', schedulePosition, { passive: true });
}

function watch() {
    const form = document.getElementById('send_form');
    if (!form) return false;
    if (!observer) {
        observer = new MutationObserver(() => { scheduleBar(); schedulePosition(); });
        observer.observe(form, { childList: true, subtree: true });
    }
    if (!resizeObs && typeof ResizeObserver === 'function') {
        resizeObs = new ResizeObserver(schedulePosition);
        resizeObs.observe(form);
        const c = chat();
        if (c) resizeObs.observe(c);
    }
    return true;
}

export function initChatTools() {
    clearInterval(mountTimer);
    const ready = () => {
        bindGeneration();
        const a = watch();
        if (a) { bindDom(); ensureButtons(); applyBar(); schedulePosition(); }
        const b = mountMenuItem();
        const c = mountPanel();
        return a && b && c && genListeners.length > 0;
    };
    if (ready()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (ready() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupChatTools() {
    clearInterval(mountTimer);
    clearTimeout(barTimer);
    barTimer = null;
    clearTimeout(posFrame);
    posFrame = null;
    disarmDeepen('扩展关了');
    observer?.disconnect();
    observer = null;
    resizeObs?.disconnect();
    resizeObs = null;
    const context = ctx();
    for (const [type, fn] of genListeners) { try { context?.eventSource?.removeListener?.(type, fn); } catch { /* ignore */ } }
    genListeners = [];
    if (bound) {
        window.removeEventListener('resize', schedulePosition);
        document.removeEventListener('click', onSendClick, true);
        document.removeEventListener('focusin', schedulePosition, true);
        document.removeEventListener('focusout', schedulePosition, true);
        chat()?.removeEventListener('scroll', schedulePosition);
        bound = false;
    }
    document.querySelectorAll(`.${HIDE_CLASS}`).forEach((el) => el.classList.remove(HIDE_CLASS));
    document.querySelectorAll(`.${EMPTY_BAR}`).forEach((el) => el.classList.remove(EMPTY_BAR));
    for (const id of [MENU_ID, BOTTOM_MENU_ID, PROMPTS_MENU_ID, ROW_ID, SETTINGS_ID]) document.getElementById(id)?.remove();
    document.body?.classList.remove('tt-hide-agent');
}

export const __test = { applyBar, position, onDeepen, onSendClick, openPromptPicker, PROMPTS, settings, varButtons };
