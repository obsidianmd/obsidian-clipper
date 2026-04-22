export const boss_decrypt = (input: string | string[]): string | string[] => {
        const FONT_MAP: Record<string, string> = {
                '\ue030': '0', '\ue031': '0', '\ue032': '1', '\ue033': '2', '\ue034': '3', 
                '\ue035': '4', '\ue036': '5', '\ue037': '6', '\ue038': '7', '\ue039': '8', 
                '\ue03a': '9', '\ue03b': '0'
        };

        const decode = (text: string): string => {
                if (!text) return '';
                return text.split('').map(char => FONT_MAP[char] || char).join('');
        };

        if (Array.isArray(input)) {
                return input.map(decode);
        } else {
                return decode(input);
        }
};
