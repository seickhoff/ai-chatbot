import OpenAI from 'openai';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ChatGPTService {
  private openai: OpenAI;
  private conversationHistory: Message[];
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4-turbo-preview') {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
    this.conversationHistory = [
      {
        role: 'system',
        content:
          'You are a helpful voice assistant. Provide clear, concise responses suitable for text-to-speech output. Keep responses conversational and natural.',
      },
    ];
  }

  async sendMessage(userMessage: string): Promise<string> {
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: this.conversationHistory,
        temperature: 0.7,
        max_tokens: 500,
      });

      const assistantMessage = completion.choices[0]?.message?.content || '';

      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage,
      });

      return assistantMessage;
    } catch (error) {
      console.error('❌ OpenAI API error:', error);
      throw error;
    }
  }

  clearHistory(): void {
    this.conversationHistory = [this.conversationHistory[0]];
  }

  getHistory(): Message[] {
    return [...this.conversationHistory];
  }
}
