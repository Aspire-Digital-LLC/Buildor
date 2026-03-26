export interface Skill {
  name: string;
  description: string;
  params: SkillParam[];
  content: string;
  projectScoped: boolean;
}

export interface SkillParam {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  required: boolean;
  flag?: string;
  default?: string | number | boolean;
  options?: string[];  // for select type
  description?: string;
}
