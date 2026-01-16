export interface Message {
  id: string;
  sender: 'user' | 'bot' | 'status';
  text: string;
}

export interface Blob {
  data: string;
  mimeType: string;
}
