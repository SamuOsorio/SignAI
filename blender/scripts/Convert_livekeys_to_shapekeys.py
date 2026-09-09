"""Converts all sliders to shapekeys. You can then find the shapekeys in the shapekey panel of the mesh."""
# This is a script template. DON'T FORGET TO SAVE!
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
    for key in human.keys.all_livekeys:
        key.to_shapekey()
