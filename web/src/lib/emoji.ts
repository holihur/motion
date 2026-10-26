export interface EmojiItem {
  char: string
  name: string
  group: string
}

const raw: [string, string, string][] = [
  ["😀", "grinning", "Smileys"], ["😃", "smiley", "Smileys"], ["😄", "smile", "Smileys"],
  ["😁", "grin", "Smileys"], ["😆", "laughing", "Smileys"], ["😅", "sweat smile", "Smileys"],
  ["😂", "joy", "Smileys"], ["🙂", "slightly smiling", "Smileys"], ["🙃", "upside down", "Smileys"],
  ["😉", "wink", "Smileys"], ["😊", "blush", "Smileys"], ["😇", "innocent", "Smileys"],
  ["🥰", "smiling hearts", "Smileys"], ["😍", "heart eyes", "Smileys"], ["🤩", "star struck", "Smileys"],
  ["😘", "kiss", "Smileys"], ["😴", "sleeping", "Smileys"], ["🤔", "thinking", "Smileys"],
  ["🤨", "raised eyebrow", "Smileys"], ["😐", "neutral", "Smileys"], ["😶", "speechless", "Smileys"],
  ["🙄", "eye roll", "Smileys"], ["😏", "smirk", "Smileys"], ["😬", "grimace", "Smileys"],
  ["😌", "relieved", "Smileys"], ["😔", "pensive", "Smileys"], ["😪", "sleepy", "Smileys"],
  ["😮", "surprised", "Smileys"], ["😲", "astonished", "Smileys"], ["🥳", "party", "Smileys"],
  ["😎", "cool", "Smileys"], ["🤓", "nerd", "Smileys"], ["🧐", "monocle", "Smileys"],
  ["😕", "confused", "Smileys"], ["😟", "worried", "Smileys"], ["😢", "cry", "Smileys"],
  ["😭", "sob", "Smileys"], ["😤", "triumph", "Smileys"], ["😡", "angry", "Smileys"],
  ["🤯", "exploding head", "Smileys"], ["😳", "flushed", "Smileys"], ["🥺", "pleading", "Smileys"],
  ["😱", "scream", "Smileys"], ["😴", "sleep", "Smileys"], ["🤒", "sick", "Smileys"],
  ["🤗", "hug", "Smileys"], ["🤝", "handshake", "People"], ["👍", "thumbs up", "People"],
  ["👎", "thumbs down", "People"], ["👏", "clap", "People"], ["🙌", "raised hands", "People"],
  ["🙏", "pray", "People"], ["💪", "muscle", "People"], ["👀", "eyes", "People"],
  ["🧠", "brain", "People"], ["👋", "wave", "People"], ["✌️", "victory", "People"],
  ["🤞", "fingers crossed", "People"], ["👌", "ok", "People"], ["🫶", "heart hands", "People"],
  ["🐶", "dog", "Nature"], ["🐱", "cat", "Nature"], ["🦊", "fox", "Nature"],
  ["🐻", "bear", "Nature"], ["🐼", "panda", "Nature"], ["🐨", "koala", "Nature"],
  ["🦁", "lion", "Nature"], ["🐯", "tiger", "Nature"], ["🐸", "frog", "Nature"],
  ["🐵", "monkey", "Nature"], ["🦄", "unicorn", "Nature"], ["🐝", "bee", "Nature"],
  ["🦋", "butterfly", "Nature"], ["🐢", "turtle", "Nature"], ["🐙", "octopus", "Nature"],
  ["🦋", "butterfly", "Nature"], ["🌵", "cactus", "Nature"], ["🌲", "tree", "Nature"],
  ["🌳", "deciduous tree", "Nature"], ["🌴", "palm", "Nature"], ["🌱", "seedling", "Nature"],
  ["🍀", "clover", "Nature"], ["🌿", "herb", "Nature"], ["🍁", "maple", "Nature"],
  ["🌻", "sunflower", "Nature"], ["🌹", "rose", "Nature"], ["🌸", "blossom", "Nature"],
  ["🌈", "rainbow", "Nature"], ["☀️", "sun", "Nature"], ["🌙", "moon", "Nature"],
  ["⭐", "star", "Nature"], ["✨", "sparkles", "Nature"], ["⚡", "zap", "Nature"],
  ["🔥", "fire", "Nature"], ["❄️", "snowflake", "Nature"], ["🌊", "wave", "Nature"],
  ["☁️", "cloud", "Nature"], ["🌧️", "rain", "Nature"], ["🍎", "apple", "Food"],
  ["🍊", "orange", "Food"], ["🍋", "lemon", "Food"], ["🍉", "watermelon", "Food"],
  ["🍇", "grapes", "Food"], ["🍓", "strawberry", "Food"], ["🥑", "avocado", "Food"],
  ["🥐", "croissant", "Food"], ["🍞", "bread", "Food"], ["🧇", "waffle", "Food"],
  ["🍳", "egg", "Food"], ["🥗", "salad", "Food"], ["🍜", "noodles", "Food"],
  ["🍣", "sushi", "Food"], ["🍕", "pizza", "Food"], ["🌮", "taco", "Food"],
  ["🍰", "cake", "Food"], ["🍪", "cookie", "Food"], ["🍫", "chocolate", "Food"],
  ["☕", "coffee", "Food"], ["🍵", "tea", "Food"], ["🧋", "bubble tea", "Food"],
  ["🍺", "beer", "Food"], ["🍷", "wine", "Food"], ["💡", "idea", "Objects"],
  ["📚", "books", "Objects"], ["📖", "book", "Objects"], ["📝", "memo", "Objects"],
  ["✏️", "pencil", "Objects"], ["✒️", "pen", "Objects"], ["🖊️", "pen", "Objects"],
  ["🖌️", "brush", "Objects"], ["📌", "pin", "Objects"], ["📎", "paperclip", "Objects"],
  ["📅", "calendar", "Objects"], ["🗓️", "calendar", "Objects"], ["⏰", "alarm", "Objects"],
  ["⏳", "hourglass", "Objects"], ["🔔", "bell", "Objects"], ["🎯", "target", "Objects"],
  ["🎨", "palette", "Objects"], ["🎧", "headphones", "Objects"], ["🎵", "music", "Objects"],
  ["🎸", "guitar", "Objects"], ["🎮", "game", "Objects"], ["🧩", "puzzle", "Objects"],
  ["🏆", "trophy", "Objects"], ["🥇", "gold medal", "Objects"], ["🎉", "party popper", "Objects"],
  ["🎁", "gift", "Objects"], ["💎", "gem", "Objects"], ["💰", "money", "Objects"],
  ["💳", "card", "Objects"], ["📈", "chart up", "Objects"], ["📉", "chart down", "Objects"],
  ["📊", "bar chart", "Objects"], ["🧮", "abacus", "Objects"], ["🔬", "microscope", "Objects"],
  ["🔭", "telescope", "Objects"], ["🧪", "test tube", "Objects"], ["💻", "laptop", "Objects"],
  ["🖥️", "desktop", "Objects"], ["⌨️", "keyboard", "Objects"], ["🖱️", "mouse", "Objects"],
  ["📱", "phone", "Objects"], ["📷", "camera", "Objects"], ["🔋", "battery", "Objects"],
  ["🔌", "plug", "Objects"], ["🧭", "compass", "Objects"], ["🗺️", "map", "Objects"],
  ["🏠", "house", "Travel"], ["🏡", "house garden", "Travel"], ["🏢", "office", "Travel"],
  ["🚀", "rocket", "Travel"], ["✈️", "plane", "Travel"], ["🚗", "car", "Travel"],
  ["🚲", "bike", "Travel"], ["⛵", "sailboat", "Travel"], ["🚂", "train", "Travel"],
  ["🗽", "statue", "Travel"], ["🗼", "tokyo tower", "Travel"], ["🏔️", "mountain", "Travel"],
  ["🏖️", "beach", "Travel"], ["🌋", "volcano", "Travel"], ["🛸", "ufo", "Travel"],
  ["❤️", "heart", "Symbols"], ["🧡", "orange heart", "Symbols"], ["💛", "yellow heart", "Symbols"],
  ["💚", "green heart", "Symbols"], ["💙", "blue heart", "Symbols"], ["💜", "purple heart", "Symbols"],
  ["🖤", "black heart", "Symbols"], ["🤍", "white heart", "Symbols"], ["💔", "broken heart", "Symbols"],
  ["✅", "check", "Symbols"], ["☑️", "checkbox", "Symbols"], ["❌", "cross", "Symbols"],
  ["⚠️", "warning", "Symbols"], ["🚧", "construction", "Symbols"], ["🔒", "lock", "Symbols"],
  ["🔑", "key", "Symbols"], ["💬", "comment", "Symbols"], ["🔗", "link", "Symbols"],
  ["♻️", "recycle", "Symbols"], ["➕", "plus", "Symbols"], ["➡️", "arrow right", "Symbols"],
  ["🔴", "red circle", "Symbols"], ["🟠", "orange circle", "Symbols"], ["🟡", "yellow circle", "Symbols"],
  ["🟢", "green circle", "Symbols"], ["🔵", "blue circle", "Symbols"], ["🟣", "purple circle", "Symbols"],
  ["⚫", "black circle", "Symbols"], ["⚪", "white circle", "Symbols"],
]

export const EMOJIS: EmojiItem[] = raw.map(([char, name, group]) => ({ char, name, group }))

export const EMOJI_GROUPS = Array.from(new Set(EMOJIS.map((emoji) => emoji.group)))

export function searchEmojis(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return EMOJIS
  return EMOJIS.filter(
    (emoji) => emoji.name.includes(q) || emoji.group.toLowerCase().includes(q) || emoji.char === q,
  )
}
