/**
 * Test fixtures for birthday message classification.
 * These are used by the test-prompt CLI and unit tests.
 */

export const testMessages = {
  // Initial birthday wishes - should be detected as isBirthday=true, isInitialWish=true
  birthday_initial: [
    'יום הולדת שמח לדני! 🎂🎉',
    'Happy birthday David!! 🎈',
    'מזל טוב ליום ההולדת שרה!',
    'יום הולדת שמח לגיל! שתהיה שנה מעולה',
    'Happy birthday to our amazing colleague Yossi! 🎉',
    'דני, יום הולדת שמח! שיהיה לך יום מדהים',
    'מזל טוב לשרה ליום הולדתה! 🎂',
    'יום הולדת שמח לך מיכל! 🥳',
    'Wishing a very happy birthday to Avi! 🎈🎉',
    'יום הולדת שמח אורי! מאחל לך רק טוב 🎁',
  ],

  // Follow-up messages - should be detected as isBirthday=true, isInitialWish=false
  birthday_followup: [
    'מזל טוב!',
    '🎂🎂🎂',
    '🎉',
    '+1',
    'מזל טוב!!',
    'Happy birthday!',
    'מצטרף/ת!',
    'מצטרף למאחלים!',
    '🎈🎂🎊',
    'יום הולדת שמח!',
    '🥳🥳',
    'מזל טוב גדול!',
    'HBD!',
    '👏👏',
    'מאחל גם!',
  ],

  // Non-birthday messages - should be detected as isBirthday=false
  not_birthday: [
    'מישהו יודע מתי הפגישה?',
    'תודה על העזרה!',
    'שיהיה לכולם סופ"ש טוב',
    'האם מישהו יכול לעזור לי עם הפרויקט?',
    'Good morning everyone!',
    'בוקר טוב לכולם ☀️',
    'מי מגיע מחר למשרד?',
    'הפגישה נדחתה לשעה 3',
    'Thanks for the update!',
    'סיימתי את המשימה',
    'יש לי שאלה לגבי הדוח',
    'אני יוצא להפסקה',
    'מצוין, תודה!',
    'מישהו רוצה קפה?',
    'הגעתי למשרד',
  ],
};

// Edge cases that might be tricky
export const edgeCases = {
  // These mention birthday but are not wishes
  birthday_mentions_not_wishes: [
    'מתי יום ההולדת של דני?',
    'When is the birthday party?',
    'אני צריך לקנות מתנה ליום הולדת',
    'יש לנו הרבה ימי הולדת החודש',
  ],

  // Ambiguous messages
  ambiguous: [
    'מזל טוב על ההצלחה!', // Congratulations but not birthday
    'כל הכבוד! 🎉', // Celebration but not birthday
    'מדהים! 👏', // Could be anything
  ],
};

