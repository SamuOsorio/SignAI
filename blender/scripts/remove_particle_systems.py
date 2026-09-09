# This is a script template. DON'T FORGET TO SAVE!
# It should be in the scripts folder of your Human Generator content pack folder.
# Saved scripts will appear in available scripts list.
# For API documentation, see https://help.humgen3d.com

import bpy
from HumGen3D import Human

def main(context: bpy.types.Context, human: Human):
    """This function is called when the script is executed.

    Args:
        context (bpy.types.Context): Blender context.
        human (Human): Instance of a single human. Script will be run for each human.
    """
    for mod in human.hair.modifiers:
        human.objects.body.modifiers.remove(mod)
