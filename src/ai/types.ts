export interface ClassificationResult {
  /** Is this message about someone's birthday? */
  isBirthday: boolean;
  
  /** Is this the initial/first birthday wish (not a follow-up like "מזל טוב!")? */
  isInitialWish: boolean;
  
  /** The name of the birthday person if mentioned */
  birthdayPersonName: string | null;
  
  /** Confidence score from 0 to 1 */
  confidence: number;
  
  /** Optional reasoning for the classification */
  reasoning?: string;
}

export interface GeneratedMessage {
  /** The generated birthday wish message */
  message: string;
  
  /** Language of the message (he/en) */
  language: 'he' | 'en' | 'mixed';
}

